import Foundation

final class StorageService: StorageServiceType {
    private let baseDirectory: URL
    private let dateFormatter: DateFormatter
    private let timeFormatter: DateFormatter
    private let userDefaults = UserDefaults.standard

    init() {
        self.baseDirectory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("ContextCollector")
        
        self.dateFormatter = DateFormatter()
        self.dateFormatter.dateFormat = "yyyy-MM-dd"
        
        self.timeFormatter = DateFormatter()
        self.timeFormatter.dateFormat = "HH-mm"
        
        setupDirectories()
    }
    
    private func setupDirectories() {
        let fileManager = FileManager.default
        
        // 创建基础目录
        if !fileManager.fileExists(atPath: baseDirectory.path) {
            try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true, attributes: nil)
        }
        
        // 创建inbox目录
        let inboxDir = baseDirectory.appendingPathComponent("inbox")
        if !fileManager.fileExists(atPath: inboxDir.path) {
            try? fileManager.createDirectory(at: inboxDir, withIntermediateDirectories: true, attributes: nil)
        }
        
        // 创建projects目录
        let projectsDir = baseDirectory.appendingPathComponent("projects")
        if !fileManager.fileExists(atPath: projectsDir.path) {
            try? fileManager.createDirectory(at: projectsDir, withIntermediateDirectories: true, attributes: nil)
        }
        
        // 创建默认项目
        let defaultProjects = ["Ideas", "Research", "WorkNotes", "TestProject"]
        for project in defaultProjects {
            let projectDir = projectsDir.appendingPathComponent(project)
            if !fileManager.fileExists(atPath: projectDir.path) {
                try? fileManager.createDirectory(at: projectDir, withIntermediateDirectories: true, attributes: nil)
            }
        }
    }
    
    func getProjects() -> [String] {
        let projectsDir = baseDirectory.appendingPathComponent("projects")
        
        do {
            let contents = try FileManager.default.contentsOfDirectory(at: projectsDir, 
                                                                     includingPropertiesForKeys: nil, 
                                                                     options: .skipsHiddenFiles)
            
            return contents.compactMap { url in
                var isDirectory: ObjCBool = false
                if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
                   isDirectory.boolValue {
                    return url.lastPathComponent
                }
                return nil
            }.sorted()
            
        } catch {
            print("⚠️ 无法读取项目目录: \(error)")
            return []
        }
    }
    
    func createProject(name: String) -> Bool {
        let sanitizedName = sanitizeTitle(name)
        
        if sanitizedName.isEmpty || sanitizedName == "untitled" {
            print("❌ 项目名称无效")
            return false
        }
        
        let projectsDir = baseDirectory.appendingPathComponent("projects")
        let newProjectDir = projectsDir.appendingPathComponent(sanitizedName)
        
        // 检查项目是否已存在
        if FileManager.default.fileExists(atPath: newProjectDir.path) {
            print("⚠️ 项目已存在: \(sanitizedName)")
            return false
        }
        
        // 创建项目目录
        do {
            try FileManager.default.createDirectory(at: newProjectDir, withIntermediateDirectories: true, attributes: nil)
            print("✅ 项目创建成功: \(sanitizedName)")
            return true
        } catch {
            print("❌ 项目创建失败: \(error)")
            return false
        }
    }
    
    func saveContent(_ content: String, title: String, project: String?) -> URL? {
        let now = Date()
        let dateString = dateFormatter.string(from: now)
        let timeString = timeFormatter.string(from: now)
        
        // 确定保存目录
        let parentDirectory: URL
        if let project = project, !project.isEmpty {
            parentDirectory = baseDirectory
                .appendingPathComponent("projects")
                .appendingPathComponent(project)
        } else {
            parentDirectory = baseDirectory.appendingPathComponent("inbox")
        }
        
        // 创建日期目录
        let dayDirectory = parentDirectory.appendingPathComponent(dateString)
        do {
            try FileManager.default.createDirectory(at: dayDirectory, withIntermediateDirectories: true, attributes: nil)
        } catch {
            print("❌ 无法创建目录: \(error)")
            return nil
        }
        
        // 生成文件名
        let cleanTitle = sanitizeTitle(title)
        let fileName = "\(timeString)_\(cleanTitle).md"
        let filePath = dayDirectory.appendingPathComponent(fileName)
        
        // 保存文件
        do {
            try content.write(to: filePath, atomically: true, encoding: .utf8)
            print("✅ 文件保存成功: \(filePath.path)")
            return filePath
        } catch {
            print("❌ 文件保存失败: \(error)")
            return nil
        }
    }
    
    private func sanitizeTitle(_ title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        
        if trimmed.isEmpty {
            return "untitled"
        }
        
        let illegalCharacters = CharacterSet(charactersIn: "\\/:*?\"<>|")
        let sanitized = trimmed.components(separatedBy: illegalCharacters).joined(separator: "-")
        
        let maxLength = 50
        if sanitized.count > maxLength {
            return String(sanitized.prefix(maxLength))
        }
        
        return sanitized
    }
    
    // MARK: - 默认项目记忆功能
    
    /// 获取上次选择的项目
    func getLastSelectedProject() -> String? {
        return userDefaults.string(forKey: "lastSelectedProject")
    }
    
    /// 保存当前选择的项目
    func saveLastSelectedProject(_ project: String?) {
        if let project = project {
            userDefaults.set(project, forKey: "lastSelectedProject")
        } else {
            userDefaults.removeObject(forKey: "lastSelectedProject")
        }
    }
}
