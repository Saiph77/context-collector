import Foundation

struct ServiceContainer {
    let clipboard: ClipboardServiceType
    let storage: StorageServiceType
    let hotkey: HotkeyServiceType
    let preferences: PreferencesServiceType
}

