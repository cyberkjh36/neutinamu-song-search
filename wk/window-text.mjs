import {koreanGloss} from './ui-text.mjs?v=3.8';
const text = {
 'ko-KR':['PC 화면 접기 / 펼치기','이 방 PC에 화면 접기 업데이트를 설치해 주세요.','업데이트한 방에서는 PC를 25초 동안 조작하지 않으면 런처가 작은 아이콘으로 접힙니다. 휴대폰의 PC 화면 버튼으로 언제든 접거나 다시 펼칠 수 있습니다.'],
 'th-TH':['ย่อ / เปิดหน้าต่าง PC','กรุณาอัปเดตโปรแกรมบน PC ของห้องนี้เพื่อใช้ปุ่มนี้','หลังอัปเดต หากไม่มีใครใช้ PC เป็นเวลา 25 วินาที หน้าต่างจะย่อเป็นไอคอนเล็ก แตะปุ่มหน้าต่าง PC บนโทรศัพท์เพื่อย่อหรือเปิดอีกครั้งได้ทุกเมื่อ'],
 'fil-PH':['Paliitin / ibalik ang PC window','I-update ang launcher sa PC ng kuwartong ito para magamit ang button.','Kapag na-update na ang PC at hindi ito ginamit nang 25 segundo, magiging maliit na icon ang launcher. Pindutin ang PC window button sa telepono upang paliitin o ibalik ito anumang oras.'],
 'vi-VN':['Thu nhỏ / mở lại cửa sổ PC','Hãy cập nhật ứng dụng trên PC của phòng để dùng nút này.','Sau khi cập nhật, cửa sổ PC sẽ thu thành biểu tượng nhỏ sau 25 giây không thao tác. Bạn có thể nhấn nút cửa sổ PC trên điện thoại để thu nhỏ hoặc mở lại bất cứ lúc nào.'],
 'ne-NP':['PC को झ्याल सानो बनाउने / खोल्ने','यो बटन चलाउन कोठाको PC लन्चर अपडेट गर्नुहोस्।','अपडेटपछि PC नचलाएको 25 सेकेन्डमा झ्याल सानो आइकनमा बदलिन्छ। फोनको PC झ्याल बटन थिचेर जुनसुकै बेला सानो बनाउन वा फेरि खोल्न सक्नुहुन्छ।'],
 'mn-MN':['PC цонхыг хураах / дэлгэх','Энэ товчийг ашиглахын тулд өрөөний PC программыг шинэчилнэ үү.','Шинэчилсний дараа PC-г 25 секунд ашиглахгүй бол цонх жижиг дүрс болж хураагдана. Утасны PC цонхны товчоор хүссэн үедээ хурааж эсвэл дэлгэж болно.'],
 'id-ID':['Kecilkan / tampilkan jendela PC','Perbarui aplikasi di PC ruangan ini untuk menggunakan tombol ini.','Setelah diperbarui, jendela PC mengecil menjadi ikon jika PC tidak digunakan selama 25 detik. Ketuk tombol jendela PC di ponsel kapan saja untuk mengecilkan atau membukanya kembali.'],
 'lo-LA':['ຫຍໍ້ / ເປີດປ່ອງຢ້ຽມ PC','ກະລຸນາອັບເດດໂປຣແກຣມໃນ PC ຂອງຫ້ອງນີ້ເພື່ອໃຊ້ປຸ່ມນີ້.','ຫຼັງຈາກອັບເດດ ຖ້າບໍ່ໄດ້ໃຊ້ PC ເປັນເວລາ 25 ວິນາທີ ປ່ອງຢ້ຽມຈະຫຍໍ້ເປັນໄອຄອນນ້ອຍ. ແຕະປຸ່ມປ່ອງຢ້ຽມ PC ໃນໂທລະສັບເພື່ອຫຍໍ້ ຫຼື ເປີດຄືນໄດ້ທຸກເວລາ.'],
 'my-MM':['PC ဝင်းဒိုး ချုံ့ရန် / ပြန်ဖွင့်ရန်','ဤခလုတ်ကို သုံးရန် အခန်းရှိ PC အက်ပ်ကို အပ်ဒိတ်လုပ်ပါ။','အပ်ဒိတ်လုပ်ပြီးနောက် PC ကို 25 စက္ကန့်ကြာ အသုံးမပြုပါက ဝင်းဒိုးသည် အိုင်ကွန်အသေးအဖြစ် ချုံ့သွားပါမည်။ ဖုန်းရှိ PC ဝင်းဒိုးခလုတ်ကို နှိပ်၍ အချိန်မရွေး ချုံ့နိုင်သလို ပြန်ဖွင့်နိုင်ပါသည်။'],
 'zh-CN':['收起 / 展开电脑窗口','请更新本房间的电脑程序以使用此按钮。','更新后，电脑连续25秒无人操作时，窗口会收成一个小图标。随时轻点手机上的电脑窗口按钮即可收起或展开。'],
 'ja-JP':['PC画面を小さくする／元に戻す','このボタンを使うには、部屋のPCアプリを更新してください。','更新後は、PCを25秒間操作しないとウィンドウが小さなアイコンになります。スマートフォンのPC画面ボタンで、いつでも小さくしたり元に戻したりできます。']
};
export function windowWords(lang){
 const [label,upgrade,idle]=text[lang],ko=text['ko-KR'];
 return {label:koreanGloss(label,ko[0],lang),upgrade:koreanGloss(upgrade,ko[1],lang),idle:koreanGloss(idle,ko[2],lang)};
}
