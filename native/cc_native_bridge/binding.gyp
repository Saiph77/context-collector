{
  "targets": [
    {
      "target_name": "cc_native_bridge",
      "sources": ["src/cc_native_bridge.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "CLANG_CXX_LIBRARY": "libc++",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_LDFLAGS": [
          "-framework AppKit",
          "-framework CoreGraphics",
          "-framework Foundation"
        ]
      }
    }
  ]
}
