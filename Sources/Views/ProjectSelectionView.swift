import SwiftUI

// MARK: - 项目选择视图
struct ProjectSelectionView: View {
    let projects: [String]
    let selectedProject: String?
    let keyboardSelectedIndex: Int  // 键盘选择的索引 (-1为Inbox，0+为项目索引)
    let onProjectSelected: (String?, Int) -> Void
    let onNewProject: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("项目")
                .font(.headline)
                .padding(.horizontal)
            
            // Inbox选项
            ProjectButton(
                name: "Inbox",
                icon: "📥",
                isSelected: selectedProject == nil,
                isKeyboardSelected: keyboardSelectedIndex == -1
            ) {
                onProjectSelected(nil, -1)
            }
            
            Divider()
            
            // 项目列表
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(projects.enumerated()), id: \.element) { index, project in
                        ProjectButton(
                            name: project,
                            icon: "📁",
                            isSelected: selectedProject == project,
                            isKeyboardSelected: keyboardSelectedIndex == index
                        ) {
                            onProjectSelected(project, index)
                        }
                    }
                }
            }
            
            Spacer()
            
            // 新增项目按钮
            Button(action: onNewProject) {
                HStack(spacing: 8) {
                    Text("➕")
                    Text("新增项目")
                        .font(.system(size: 13))
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.blue.opacity(0.1))
                )
                .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
        .frame(width: 200)
        .background(Color(NSColor.controlBackgroundColor))
    }
}