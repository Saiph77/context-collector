#include <AppKit/AppKit.h>
#include <CoreGraphics/CoreGraphics.h>
#include <Foundation/Foundation.h>
#include <napi.h>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <thread>

namespace {

struct KeyEventPayload {
  int64_t keycode;
  uint64_t flags;
  bool isCommand;
  bool isOptionOnly;
  bool isFlagsChanged;
};

std::mutex g_mutex;
Napi::ThreadSafeFunction g_tsfn;
std::thread g_listenerThread;
CFMachPortRef g_eventTap = nullptr;
CFRunLoopSourceRef g_runLoopSource = nullptr;
CFRunLoopRef g_runLoop = nullptr;
std::atomic<bool> g_running{false};

void CleanupTapLocked() {
  if (g_runLoopSource != nullptr && g_runLoop != nullptr) {
    CFRunLoopRemoveSource(g_runLoop, g_runLoopSource, kCFRunLoopCommonModes);
    CFRelease(g_runLoopSource);
    g_runLoopSource = nullptr;
  }

  if (g_eventTap != nullptr) {
    CFMachPortInvalidate(g_eventTap);
    CFRelease(g_eventTap);
    g_eventTap = nullptr;
  }

  if (g_runLoop != nullptr) {
    CFRelease(g_runLoop);
    g_runLoop = nullptr;
  }
}

CGEventRef EventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void* refcon) {
  (void)proxy;
  (void)refcon;

  if (type != kCGEventKeyDown && type != kCGEventFlagsChanged) {
    return event;
  }

  if (!g_running.load()) {
    return event;
  }

  const int64_t keycode = CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  const uint64_t flags = static_cast<uint64_t>(CGEventGetFlags(event));
  const bool isCommand = (flags & static_cast<uint64_t>(kCGEventFlagMaskCommand)) != 0;
  const bool isOption = (flags & static_cast<uint64_t>(kCGEventFlagMaskAlternate)) != 0;
  const uint64_t nonOptionModifierMask =
      static_cast<uint64_t>(kCGEventFlagMaskCommand) |
      static_cast<uint64_t>(kCGEventFlagMaskShift) |
      static_cast<uint64_t>(kCGEventFlagMaskControl);
  const bool isOptionOnly = isOption && ((flags & nonOptionModifierMask) == 0);
  const bool isFlagsChanged = (type == kCGEventFlagsChanged);

  KeyEventPayload* payload = new KeyEventPayload{
      keycode, flags, isCommand, isOptionOnly, isFlagsChanged};

  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_tsfn) {
    const napi_status status = g_tsfn.BlockingCall(
        payload, [](Napi::Env env, Napi::Function jsCallback, KeyEventPayload* data) {
          Napi::Object eventObj = Napi::Object::New(env);
          eventObj.Set("keycode", Napi::Number::New(env, static_cast<double>(data->keycode)));
          eventObj.Set("flags", Napi::Number::New(env, static_cast<double>(data->flags)));
          eventObj.Set("isCommand", Napi::Boolean::New(env, data->isCommand));
          eventObj.Set("isOptionOnly", Napi::Boolean::New(env, data->isOptionOnly));
          eventObj.Set("eventType", Napi::String::New(
                                        env, data->isFlagsChanged ? "flagsChanged" : "keyDown"));
          jsCallback.Call({eventObj});
          delete data;
        });

    if (status != napi_ok) {
      delete payload;
    }
  } else {
    delete payload;
  }

  return event;
}

void ListenerThreadMain() {
  @autoreleasepool {
    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventFlagsChanged);

    {
      std::lock_guard<std::mutex> lock(g_mutex);
      g_eventTap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                                    kCGEventTapOptionListenOnly, mask, EventTapCallback,
                                    nullptr);
      if (g_eventTap == nullptr) {
        g_running.store(false);
        return;
      }

      g_runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_eventTap, 0);
      if (g_runLoopSource == nullptr) {
        CleanupTapLocked();
        g_running.store(false);
        return;
      }

      g_runLoop = CFRunLoopGetCurrent();
      CFRetain(g_runLoop);
      CFRunLoopAddSource(g_runLoop, g_runLoopSource, kCFRunLoopCommonModes);
      CGEventTapEnable(g_eventTap, true);
    }

    CFRunLoopRun();

    std::lock_guard<std::mutex> lock(g_mutex);
    CleanupTapLocked();
    g_running.store(false);
  }
}

void StopListenerInternal() {
  bool expected = true;
  if (!g_running.compare_exchange_strong(expected, false)) {
    return;
  }

  {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_runLoop != nullptr) {
      CFRunLoopPerformBlock(g_runLoop, kCFRunLoopCommonModes, ^{
        CFRunLoopStop(g_runLoop);
      });
      CFRunLoopWakeUp(g_runLoop);
    }
  }

  if (g_listenerThread.joinable()) {
    g_listenerThread.join();
  }

  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_tsfn) {
    g_tsfn.Release();
    g_tsfn = Napi::ThreadSafeFunction();
  }
}

Napi::Value StartKeyListener(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "startKeyListener expects a callback").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (g_running.load()) {
    return Napi::Boolean::New(env, true);
  }

  Napi::Function callback = info[0].As<Napi::Function>();
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_tsfn = Napi::ThreadSafeFunction::New(env, callback, "cc_native_bridge_key_listener", 0, 1);
  }

  g_running.store(true);
  g_listenerThread = std::thread(ListenerThreadMain);

  std::this_thread::sleep_for(std::chrono::milliseconds(20));
  if (!g_running.load()) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_tsfn) {
      g_tsfn.Release();
      g_tsfn = Napi::ThreadSafeFunction();
    }
    if (g_listenerThread.joinable()) {
      g_listenerThread.join();
    }
    return Napi::Boolean::New(env, false);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value StopKeyListener(const Napi::CallbackInfo& info) {
  (void)info;
  StopListenerInternal();
  return info.Env().Undefined();
}

Napi::Value PrepareOverlayMode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto apply = ^{
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  };

  if ([NSThread isMainThread]) {
    apply();
  } else {
    dispatch_sync(dispatch_get_main_queue(), apply);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value PromoteToOverlay(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "promoteToOverlay expects a Buffer window handle")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> handleBuffer = info[0].As<Napi::Buffer<uint8_t>>();
  if (handleBuffer.Length() < sizeof(void*)) {
    return Napi::Boolean::New(env, false);
  }

  void* rawPtr = *reinterpret_cast<void**>(handleBuffer.Data());
  if (rawPtr == nullptr) {
    return Napi::Boolean::New(env, false);
  }

  __block bool promoted = false;

  auto promote = ^{
    NSView* nsView = (__bridge NSView*)rawPtr;
    NSWindow* nsWindow = [nsView window];
    if (nsWindow == nil) {
      promoted = false;
      return;
    }

    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

    NSArray<NSNumber*>* behaviors = @[
      @(NSWindowCollectionBehaviorMoveToActiveSpace |
        NSWindowCollectionBehaviorStationary |
        NSWindowCollectionBehaviorFullScreenAuxiliary),
      @(NSWindowCollectionBehaviorMoveToActiveSpace |
        NSWindowCollectionBehaviorFullScreenAuxiliary),
      @(NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorStationary |
        NSWindowCollectionBehaviorFullScreenAuxiliary),
    ];

    bool behaviorApplied = false;
    for (NSNumber* value in behaviors) {
      @try {
        [nsWindow setCollectionBehavior:[value unsignedIntegerValue]];
        behaviorApplied = true;
        break;
      } @catch (NSException* exception) {
        (void)exception;
      }
    }

    if (!behaviorApplied) {
      promoted = false;
      return;
    }

    const NSInteger shieldLevel = static_cast<NSInteger>(CGShieldingWindowLevel()) + 1;
    [nsWindow setLevel:shieldLevel];
    [nsWindow setHidesOnDeactivate:NO];
    [nsWindow makeKeyAndOrderFront:nil];
    [nsWindow orderFrontRegardless];
    promoted = true;
  };

  if ([NSThread isMainThread]) {
    promote();
  } else {
    dispatch_sync(dispatch_get_main_queue(), promote);
  }

  return Napi::Boolean::New(env, promoted);
}

void Cleanup(void* arg) {
  (void)arg;
  StopListenerInternal();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startKeyListener", Napi::Function::New(env, StartKeyListener));
  exports.Set("stopKeyListener", Napi::Function::New(env, StopKeyListener));
  exports.Set("prepareOverlayMode", Napi::Function::New(env, PrepareOverlayMode));
  exports.Set("promoteToOverlay", Napi::Function::New(env, PromoteToOverlay));

  napi_add_env_cleanup_hook(env, Cleanup, nullptr);
  return exports;
}

}  // namespace

NODE_API_MODULE(cc_native_bridge, Init)
