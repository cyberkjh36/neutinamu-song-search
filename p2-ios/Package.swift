// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "P2Core", platforms: [.macOS(.v12), .iOS(.v15)], products: [.library(name: "P2Core", targets: ["P2Core"])], targets: [.target(name: "P2Core"), .testTarget(name: "P2CoreTests", dependencies: ["P2Core"])])
