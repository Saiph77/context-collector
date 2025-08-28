import Foundation

protocol StorageServiceType {
    func getProjects() -> [String]
    func createProject(name: String) -> Bool
    func saveContent(_ content: String, title: String, project: String?) -> URL?
    func getLastSelectedProject() -> String?
    func saveLastSelectedProject(_ project: String?)
}
