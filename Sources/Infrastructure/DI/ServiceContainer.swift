import Foundation

struct ServiceContainer {
    let clipboard: ClipboardServiceType
    let storage: StorageServiceType
    var hotkey: HotkeyServiceType
    let preferences: PreferencesServiceType
}

