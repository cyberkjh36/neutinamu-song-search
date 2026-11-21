import {koreanGloss} from './ui-text.mjs?v=3.8';
const text = {
 'ko-KR':['PC 화면 접기 / 펼치기','이 방 PC에 화면 접기 업데이트를 설치해 주세요.'],
 'th-TH':['ย่อ / เปิดหน้าต่าง PC','กรุณาอัปเดตโปรแกรมบน PC ของห้องนี้เพื่อใช้ปุ่มนี้'],
 'fil-PH':['Paliitin / ibalik ang PC window','I-update ang launcher sa PC ng kuwartong ito para magamit ang button.'],
 'vi-VN':['Thu nhỏ / mở lại cửa sổ PC','Hãy cập nhật ứng dụng trên PC của phòng để dùng nút này.'],
 'ne-NP':['PC को झ्याल सानो बनाउने / खोल्ने','यो बटन चलाउन कोठाको PC लन्चर अपडेट गर्नुहोस्।'],
 'mn-MN':['PC цонхыг хураах / дэлгэх','Энэ товчийг ашиглахын тулд өрөөний PC программыг шинэчилнэ үү.'],
 'id-ID':['Kecilkan / tampilkan jendela PC','Perbarui aplikasi di PC ruangan ini untuk menggunakan tombol ini.'],
 'lo-LA':['ຫຍໍ້ / ເປີດປ່ອງຢ້ຽມ PC','ກະລຸນາອັບເດດໂປຣແກຣມໃນ PC ຂອງຫ້ອງນີ້ເພື່ອໃຊ້ປຸ່ມນີ້.'],
 'my-MM':['PC ဝင်းဒိုး ချုံ့ရန် / ပြန်ဖွင့်ရန်','ဤခလုတ်ကို သုံးရန် အခန်းရှိ PC အက်ပ်ကို အပ်ဒိတ်လုပ်ပါ။'],
 'zh-CN':['收起 / 展开电脑窗口','请更新本房间的电脑程序以使用此按钮。'],
 'ja-JP':['PC画面を小さくする／元に戻す','このボタンを使うには、部屋のPCアプリを更新してください。']
};
export function windowWords(lang){
 const [label,upgrade]=text[lang],ko=text['ko-KR'];
 return {label:koreanGloss(label,ko[0],lang),upgrade:koreanGloss(upgrade,ko[1],lang)};
}
