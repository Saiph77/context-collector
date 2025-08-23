import SwiftUI
import AppKit

struct ProjectButton: View {
    let name: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(icon)
                Text(name)
                    .font(.system(size: 13))
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(backgroundColor)
            )
            .foregroundColor(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .onHover { hovering in
            isHovered = hovering
        }
    }
    
    private var backgroundColor: Color {
        if isSelected {
            return Color.accentColor
        } else if isHovered {
            return Color.gray.opacity(0.2)
        } else {
            return Color.clear
        }
    }
}