import {koreanGloss} from './ui-text.mjs?v=3.8';

const labels = {
 'ko-KR':['유튜브 음량','줄이기','높이기','방 PC에 유튜브 음량 업데이트를 설치해 주세요.','유튜브 영상이 재생 중인지 확인해 주세요.'],
 'th-TH':['เสียง YouTube','เบาเสียง','เพิ่มเสียง','อัปเดตโปรแกรมบนพีซีในห้องเพื่อปรับเสียง YouTube','ตรวจสอบว่าวิดีโอ YouTube กำลังเล่นอยู่'],
 'fil-PH':['Lakas ng tunog sa YouTube','Hinaan','Lakasan','I-update ang PC sa kuwarto para makontrol ang lakas ng tunog sa YouTube.','Tingnan kung may nagpe-play na video sa YouTube.'],
 'vi-VN':['Âm lượng YouTube','Giảm','Tăng','Cập nhật ứng dụng trên máy tính của phòng để chỉnh âm lượng YouTube.','Hãy kiểm tra xem video YouTube có đang phát không.'],
 'ne-NP':['YouTube को आवाज','घटाउनुहोस्','बढाउनुहोस्','YouTube को आवाज मिलाउन कोठाको कम्प्युटरको एप अपडेट गर्नुहोस्।','YouTube भिडियो चलिरहेको छ कि हेर्नुहोस्।'],
 'mn-MN':['YouTube-ийн дууны түвшин','Намсгах','Чангалах','YouTube-ийн дууг тохируулахын тулд өрөөний компьютерын программыг шинэчилнэ үү.','YouTube бичлэг тоглож байгаа эсэхийг шалгана уу.'],
 'id-ID':['Volume YouTube','Kecilkan','Besarkan','Perbarui aplikasi di PC ruangan ini untuk mengatur volume YouTube.','Pastikan video YouTube sedang diputar.'],
 'lo-LA':['ລະດັບສຽງ YouTube','ຫຼຸດສຽງ','ເພີ່ມສຽງ','ອັບເດດແອັບໃນຄອມຂອງຫ້ອງເພື່ອປັບສຽງ YouTube','ກວດວ່າວິດີໂອ YouTube ກຳລັງຫຼິ້ນຢູ່'],
 'my-MM':['YouTube အသံအတိုးအကျယ်','အသံလျှော့ရန်','အသံတိုးရန်','YouTube အသံချိန်ညှိရန် အခန်းရှိ ကွန်ပျူတာအက်ပ်ကို အပ်ဒိတ်လုပ်ပါ။','YouTube ဗီဒီယို ဖွင့်ထားခြင်းရှိမရှိ စစ်ဆေးပါ။'],
 'zh-CN':['YouTube 音量','调低','调高','请更新包间电脑上的应用以调节 YouTube 音量。','请确认 YouTube 视频正在播放。'],
 'ja-JP':['YouTube の音量','下げる','上げる','YouTube の音量を調節するには、部屋の PC アプリを更新してください。','YouTube 動画が再生中か確認してください。']
};
export function volumeWords(language){
 const ko=labels['ko-KR'];
 return (labels[language]||ko).map((value,i)=>koreanGloss(value,ko[i],language));
}
