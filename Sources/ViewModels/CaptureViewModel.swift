import Foundation
import Combine

final class CaptureViewModel: ObservableObject {
    private let services: ServiceContainer

    @Published var title: String = "untitled"
    @Published var content: String = ""
    @Published var selectedProject: String?
    @Published var projects: [String] = []
    @Published var isLoading: Bool = false
    @Published var showingNewProjectDialog: Bool = false
    @Published var newProjectName: String = ""

    init(services: ServiceContainer) {
        self.services = services
    }

    func loadInitialData() {
        projects = services.storage.getProjects()
        let lastProject = services.storage.getLastSelectedProject()
        if let lastProject = lastProject, projects.contains(lastProject) {
            selectedProject = lastProject
        } else {
            selectedProject = nil
        }
        loadClipboardContent()
    }

    func loadClipboardContent() {
        isLoading = true
        DispatchQueue.global(qos: .userInitiated).async {
            Thread.sleep(forTimeInterval: 0.1)
            let clipboardText = self.services.clipboard.readClipboardText()
            DispatchQueue.main.async {
                self.isLoading = false
                if let text = clipboardText, !text.isEmpty {
                    self.content = "// 说明：\n\n\(text)"
                } else {
                    self.content = "// 说明：\n\n"
                }
            }
        }
    }

    func saveContent() -> Bool {
        print("💾 保存内容")
        services.storage.saveLastSelectedProject(selectedProject)
        if let savedPath = services.storage.saveContent(content, title: title, project: selectedProject) {
            print("✅ 保存成功: \(savedPath.path)")
            return true
        } else {
            print("❌ 保存失败")
            return false
        }
    }

    func createNewProject(name: String) {
        print("📁 创建新项目: \(name)")
        if services.storage.createProject(name: name) {
            print("✅ 项目创建成功")
            projects = services.storage.getProjects()
            selectedProject = name
        } else {
            print("❌ 项目创建失败")
        }
    }

    func selectProject(_ project: String?) {
        selectedProject = project
        print("📂 选择项目: \(project ?? "Inbox")")
    }
}
