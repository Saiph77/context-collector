import SwiftUI
import AppKit

struct NewProjectDialog: View {
    @Binding var projectName: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Text("新增项目")
                .font(.title2)
                .fontWeight(.medium)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("项目名称:")
                    .font(.headline)
                
                TextField("输入项目名称", text: $projectName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 300)
                    .onSubmit {
                        if !projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            onSave(projectName.trimmingCharacters(in: .whitespacesAndNewlines))
                        }
                    }
            }
            
            HStack(spacing: 12) {
                Button("取消") {
                    onCancel()
                }
                .keyboardShortcut(.escape)
                
                Button("创建") {
                    if !projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        onSave(projectName.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return)
                .disabled(projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(30)
        .frame(width: 400, height: 200)
    }
}