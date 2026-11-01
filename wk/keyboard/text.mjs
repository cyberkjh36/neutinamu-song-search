const columns=['keyboard','native','close','clear','space','shift','backspace','left','right','tip','limit'];
const entries={
 'ko-KR':['전용 키보드','휴대폰 키보드','닫기','전체 지우기','띄어쓰기','다른 글자','한 글자 지우기','커서 왼쪽','커서 오른쪽','글자를 입력한 뒤 검색을 누르세요.','입력 가능한 글자 수를 넘었습니다.'],
 'th-TH':['แป้นพิมพ์','แป้นพิมพ์มือถือ','ปิด','ล้างทั้งหมด','เว้นวรรค','ตัวอักษรอื่น','ลบตัวอักษร','เลื่อนซ้าย','เลื่อนขวา','พิมพ์ชื่อเพลง แล้วกดค้นหา','พิมพ์เกินจำนวนตัวอักษรที่กำหนด'],
 'fil-PH':['Keyboard','Keyboard ng telepono','Isara','Burahin lahat','Espasyo','Ibang letra','Burahin ang letra','Pakaliwa','Pakanan','I-type ang kanta, saka pindutin ang Hanapin.','Masyadong mahaba ang inilagay.'],
 'vi-VN':['Bàn phím','Bàn phím điện thoại','Đóng','Xóa hết','Dấu cách','Chữ khác','Xóa ký tự','Sang trái','Sang phải','Nhập nguyên âm rồi chọn dấu á à ả ã ạ. Nhấn tìm kiếm khi xong.','Nội dung quá dài.'],
 'ne-NP':['किबोर्ड','फोनको किबोर्ड','बन्द','सबै मेट्नुहोस्','खाली ठाउँ','थप अक्षर','अक्षर मेट्नुहोस्','बायाँ','दायाँ','पहिले व्यञ्जन, त्यसपछि मात्रा थिच्नुहोस्। अन्त्यमा खोज्नुहोस्।','अक्षरको सीमा नाघ्यो।'],
 'mn-MN':['Гар','Утасны гар','Хаах','Бүгдийг арилгах','Зай','Бусад үсэг','Үсэг арилгах','Зүүн','Баруун','Дууны нэрийг бичээд хайх товчийг дарна уу.','Тэмдэгтийн хязгаараас хэтэрсэн.'],
 'id-ID':['Keyboard','Keyboard ponsel','Tutup','Hapus semua','Spasi','Huruf lain','Hapus huruf','Ke kiri','Ke kanan','Ketik judul lagu, lalu tekan Cari.','Teks terlalu panjang.'],
 'lo-LA':['ແປ້ນພິມ','ແປ້ນພິມໂທລະສັບ','ປິດ','ລຶບທັງໝົດ','ຍະຫວ່າງ','ຕົວອັກສອນອື່ນ','ລຶບຕົວອັກສອນ','ຊ້າຍ','ຂວາ','ພິມຊື່ເພງ ແລ້ວກົດຄົ້ນຫາ','ຂໍ້ຄວາມຍາວເກີນໄປ'],
 'my-MM':['ကီးဘုတ်','ဖုန်းကီးဘုတ်','ပိတ်ရန်','အားလုံးဖျက်ရန်','နေရာလွတ်','အခြားအက္ခရာ','စာလုံးဖျက်ရန်','ဘယ်သို့','ညာသို့','ဗျည်းကို အရင်နှိပ်ပြီး သရနှင့် အသတ် ထည့်ပါ။ ပြီးလျှင် ရှာရန်ကို နှိပ်ပါ။','စာလုံးရေ ကန့်သတ်ချက် ကျော်နေပါသည်။'],
 'zh-CN':['键盘','手机键盘','关闭','清空','空格','切换字符','删除一字','光标左移','光标右移','输入拼音，再点上方汉字。连续拼音可逐字选择。','输入内容太长。'],
 'ja-JP':['キーボード','スマホのキーボード','閉じる','すべて消す','空白','ひらがな・カタカナ','1文字消す','カーソルを左へ','カーソルを右へ','かな入力。漢字は「スマホのキーボード」で入力できます。','文字数の上限を超えています。']
};
export const KEYBOARD_TEXT=Object.fromEntries(Object.entries(entries).map(([locale,values])=>[locale,Object.fromEntries(columns.map((key,i)=>[key,values[i]]))]));

export const NATIVE_KEYBOARD_HELP = {
 'ko-KR':'자판 언어가 다르면 휴대폰 키보드에서 언어를 바꿔주세요. 필요한 언어는 키보드 설정에서 추가할 수 있습니다.',
 'th-TH':'หากภาษาแป้นพิมพ์ไม่ตรง ให้เปลี่ยนภาษาบนแป้นพิมพ์มือถือ เพิ่มภาษาได้ในการตั้งค่าแป้นพิมพ์',
 'fil-PH':'Kung iba ang wika ng keyboard, palitan ito sa keyboard ng telepono. Maaari kang magdagdag ng wika sa mga setting ng keyboard.',
 'vi-VN':'Nếu bàn phím dùng ngôn ngữ khác, hãy đổi ngôn ngữ trên bàn phím điện thoại. Có thể thêm ngôn ngữ trong cài đặt bàn phím.',
 'ne-NP':'किबोर्डको भाषा फरक भए फोनको किबोर्डमा भाषा बदल्नुहोस्। किबोर्ड सेटिङमा चाहिएको भाषा थप्न सकिन्छ।',
 'mn-MN':'Гарын хэл өөр байвал утасны гараас хэлээ солино уу. Гарын тохиргооноос хэрэгтэй хэлээ нэмж болно.',
 'id-ID':'Jika bahasa keyboard berbeda, ganti bahasa pada keyboard ponsel. Bahasa dapat ditambahkan di setelan keyboard.',
 'lo-LA':'ຖ້າພາສາແປ້ນພິມບໍ່ກົງກັນ ໃຫ້ປ່ຽນພາສາໃນແປ້ນພິມໂທລະສັບ. ເພີ່ມພາສາໄດ້ໃນການຕັ້ງຄ່າແປ້ນພິມ.',
 'my-MM':'ကီးဘုတ်ဘာသာစကား မတူပါက ဖုန်းကီးဘုတ်တွင် ဘာသာစကား ပြောင်းပါ။ လိုအပ်သောဘာသာစကားကို ကီးဘုတ်ဆက်တင်တွင် ထည့်နိုင်ပါသည်။',
 'zh-CN':'如果键盘语言不同，请在手机键盘上切换语言。可以在键盘设置中添加所需语言。',
 'ja-JP':'キーボードの言語が違う場合は、スマホのキーボードで切り替えてください。必要な言語はキーボードの設定で追加できます。'
};
