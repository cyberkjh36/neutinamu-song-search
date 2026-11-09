import UIKit
import Speech
import AVFoundation

@MainActor final class SpeechSearch {
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var timer: Timer?
    private weak var dialog: UIAlertController?
    private var callback: (([String],String) -> Void)?
    private var latest = "", generation = 0
    func start(in parent: UIViewController, completion: @escaping ([String],String) -> Void) {
        guard callback == nil else { return }
        callback = completion; generation += 1; let token = generation
        SFSpeechRecognizer.requestAuthorization { [weak self, weak parent] status in
            DispatchQueue.main.async {
                guard let self, let parent, self.generation == token, self.callback != nil else { return }
                guard status == .authorized else { self.finish([],"설정에서 느티나무 리모컨의 음성 인식을 허용해 주세요. 키보드 검색도 가능합니다."); return }
                AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                    DispatchQueue.main.async {
                        guard self.generation == token, self.callback != nil else { return }
                        guard allowed else { self.finish([],"설정에서 느티나무 리모컨의 마이크를 허용해 주세요."); return }
                        self.listen(parent,token:token)
                    }
                }
            }
        }
    }
    private func listen(_ parent: UIViewController, token: Int) {
        guard let recognizer = SFSpeechRecognizer(locale:Locale(identifier:"ko-KR")), recognizer.isAvailable else { finish([],"현재 음성 인식을 사용할 수 없습니다. 키보드로 검색해 주세요."); return }
        do {
            let audio = AVAudioSession.sharedInstance(); try audio.setCategory(.record,mode:.measurement); try audio.setActive(true)
            let r = SFSpeechAudioBufferRecognitionRequest(); r.shouldReportPartialResults = true; request = r; latest = ""
            let node = engine.inputNode, format = engine.inputNode.outputFormat(forBus:0)
            guard format.sampleRate > 0 && format.channelCount > 0 else { throw P2Error.invalid("마이크를 열지 못했습니다.") }
            node.installTap(onBus:0,bufferSize:1024,format:format) { buffer,_ in r.append(buffer) }
            engine.prepare(); try engine.start()
            let alert = UIAlertController(title:"🎙 마이크 켜짐",message:"노래 제목이나 가수를 말씀해 주세요.",preferredStyle:.alert)
            alert.addAction(UIAlertAction(title:"검색",style:.default) { [weak self] _ in self?.finishLatest() })
            alert.addAction(UIAlertAction(title:"취소",style:.cancel) { [weak self] _ in self?.finish([],"음성 검색을 취소했습니다.") })
            dialog = alert; parent.present(alert,animated:true)
            task = recognizer.recognitionTask(with:r) { [weak self] result,error in
                DispatchQueue.main.async {
                    guard let self, self.generation == token, self.callback != nil else { return }
                    if let result { self.latest = String(result.bestTranscription.formattedString.prefix(200)); self.dialog?.message = self.latest
                        if result.isFinal { self.finishLatest(); return } }
                    if error != nil { self.finishLatest() }
                }
            }
            timer = Timer.scheduledTimer(withTimeInterval:15,repeats:false) { [weak self] _ in Task { @MainActor in self?.finishLatest() } }
        } catch { finish([],"마이크를 열지 못했습니다. 키보드로 검색해 주세요.") }
    }
    private func finishLatest() { finish(latest.isEmpty ? [] : [latest],latest.isEmpty ? "말소리를 듣지 못했습니다. 다시 시도해 주세요." : "") }
    func cancel() { if callback != nil { finish([],"음성 검색을 취소했습니다.") } }
    private func finish(_ texts: [String], _ message: String) {
        let done = callback; callback = nil; generation += 1; timer?.invalidate(); timer = nil
        engine.stop(); if request != nil { engine.inputNode.removeTap(onBus:0) }; request?.endAudio(); request = nil; task?.cancel(); task = nil
        try? AVAudioSession.sharedInstance().setActive(false,options:.notifyOthersOnDeactivation)
        dialog?.dismiss(animated:true); dialog = nil; done?(texts,message)
    }
}
