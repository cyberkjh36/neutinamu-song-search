import UIKit
import AVFoundation

final class QRScanner: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    let capture = AVCaptureSession()
    private let worker = DispatchQueue(label:"kr.neutinamu.qr")
    var selected: ((URL) -> Void)?
    private var preview: AVCaptureVideoPreviewLayer?
    private var finished = false
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        let close = UIButton(type:.system); close.setTitle("닫기",for:.normal); close.titleLabel?.font = .boldSystemFont(ofSize:22); close.tintColor = .white
        close.addTarget(self,action:#selector(cancel),for:.touchUpInside); close.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(close)
        NSLayoutConstraint.activate([close.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor,constant:12),close.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-24),close.heightAnchor.constraint(equalToConstant:48)])
        AVCaptureDevice.requestAccess(for:.video) { [weak self] allowed in DispatchQueue.main.async { guard let self else { return }; if allowed { self.prepare() } else { self.showError("설정에서 카메라를 허용하거나 방 번호를 직접 선택해 주세요.") } } }
    }
    private func prepare() {
        guard !finished, let camera = AVCaptureDevice.default(for:.video), let input = try? AVCaptureDeviceInput(device:camera), capture.canAddInput(input) else { showError("카메라를 열 수 없습니다. 방 번호를 직접 선택해 주세요."); return }
        capture.addInput(input); let output = AVCaptureMetadataOutput()
        guard capture.canAddOutput(output) else { showError("QR 인식을 시작하지 못했습니다."); return }
        capture.addOutput(output); output.setMetadataObjectsDelegate(self,queue:.main); output.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session:capture); layer.videoGravity = .resizeAspectFill; view.layer.insertSublayer(layer,at:0); preview = layer; view.setNeedsLayout()
        worker.async { [capture] in capture.startRunning() }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); finished = true; worker.async { [capture] in capture.stopRunning() } }
    @objc private func cancel() { finished = true; dismiss(animated:true) }
    private func showError(_ message: String) {
        let alert = UIAlertController(title:"방 QR 스캔",message:message,preferredStyle:.alert); alert.addAction(UIAlertAction(title:"닫기",style:.default) { [weak self] _ in self?.cancel() }); present(alert,animated:true)
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished, let text = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue, let url = URL(string:text), Rooms.parseLink(url) != nil else { return }
        finished = true; dismiss(animated:true) { [weak self] in self?.selected?(url) }
    }
}
