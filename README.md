# Website Audit Kit

Nhập URL → kiểm tra **tốc độ, giao diện mobile, liên kết và SEO** → nhận danh sách việc cần sửa theo mức ưu tiên. Dành cho freelancer, agency và chủ website. Giao diện tiếng Việt, chạy trên máy của bạn, không cần tài khoản hay API key.

## Chạy ứng dụng

Yêu cầu **Node.js 22 trở lên** và **Microsoft Edge hoặc Google Chrome**. Ứng dụng tự tìm trình duyệt đã cài. Nếu máy không có trình duyệt tương thích, cài Chromium bằng `npx playwright install chromium`.

Trên Windows, bấm đúp **`start_app.bat`**, chờ build, rồi mở **http://127.0.0.1:4318**. Giữ cửa sổ máy chủ mở trong lúc dùng.

Hoặc chạy trong PowerShell:

```powershell
cd D:\App\WebsiteAuditKit
npm install
npm run build
npm start
```

Chế độ phát triển có tự cập nhật giao diện:

```powershell
npm run dev
```

Mở http://127.0.0.1:5178. API chạy ở cổng 4318.

## Cách sử dụng

1. Nhập URL website công khai, có hoặc không có `https://`.
2. Chọn thiết bị **Mobile / Desktop** để đo tốc độ, và giới hạn **1 / 5 / 10 trang**.
3. Bấm **Kiểm tra website**. Tiến độ cập nhật trực tiếp; có thể hủy khi đang chạy.
4. Xem bốn hạng mục và mở từng việc cần sửa để đọc bằng chứng, hướng khắc phục và thời gian tham khảo.
5. Đánh dấu việc đã hoàn thành ở **Việc cần sửa**; tiến độ được lưu trên máy. Chạy kiểm tra mới để cập nhật điểm.
6. Xuất **PDF / HTML** để gửi báo cáo, **CSV** để đưa việc vào bảng tính, hoặc **JSON** để lấy dữ liệu đầy đủ.
7. Mở **Lịch sử kiểm tra**, chọn hai báo cáo rồi bấm **So sánh**. Xem lỗi mới, còn tồn tại, đã sửa và chưa đủ dữ liệu; lọc theo hạng mục hoặc tìm URL.
8. Mở **Theo dõi**, lưu website với tên dự án, thiết bị, phạm vi và chu kỳ. Bấm **Chạy ngay** để tạo mốc đầu tiên.
9. Bấm biểu tượng **bảng màu** trên thanh trên cùng để cấu hình tên agency, logo, màu nhận diện, khẩu hiệu và dòng chân trang trước khi xuất báo cáo.
10. Mở **Khách hàng & dự án** để tạo khách hàng, thêm dự án với tối đa 10 URL, gắn báo cáo/lịch theo dõi và quản lý người phụ trách, hạn sửa, trạng thái công việc.
11. Trong dự án, chọn thiết bị/phạm vi rồi bấm **Kiểm tra toàn bộ dự án** để kiểm tra lần lượt các website và xuất báo cáo tổng hợp.
12. Sau ít nhất hai lần kiểm tra, dùng **So sánh các lần kiểm tra** trong dự án để chọn mốc trước/sau, đối chiếu từng website, xem xu hướng tuần/tháng và xuất báo cáo so sánh.
13. Trong dự án, bấm **Tạo lịch dự án** để audit tự động mỗi 24 giờ hoặc 7 ngày; xem cảnh báo, lịch sử chạy và mở đúng cặp báo cáo để so sánh.

Ứng dụng hiển thị **báo cáo mẫu** trong lần mở đầu. Website `studio.example`, điểm số và ảnh minh họa ở báo cáo này là dữ liệu dựng sẵn, không phải kết quả quét thật. PDF/HTML chỉ xuất cho báo cáo thực tế; có thể tải JSON/CSV mẫu. Đánh dấu việc mẫu không lưu vào lịch sử.

## Báo cáo theo thương hiệu

Trong **Cài đặt báo cáo thương hiệu** (biểu tượng bảng màu), nhập tên agency, khẩu hiệu và chân trang; chọn màu và tải logo **PNG/JPEG/WebP**, tối đa **300 KB** và **4096 pixel mỗi chiều**. Khẩu hiệu, chân trang và logo có thể để trống. Bản xem trước cập nhật khi chỉnh sửa; bấm **Lưu cấu hình** để áp dụng. Có thể mở lại cấu hình bằng nút **Sửa** trong menu Xuất báo cáo. **Dùng mặc định** chỉ đổi bản nháp; cần lưu để xác nhận lựa chọn đó.

PDF/HTML dùng nhận diện đã lưu ở thời điểm xuất, với logo nhúng trực tiếp nên bản HTML mở được mà không cần tải tài nguyên ngoài. PDF A4 có tên agency và số trang ở từng trang. Màu nhận diện áp dụng cho đường viền và điểm nhấn; chữ dùng màu tối để vẫn rõ khi chọn màu nhạt. Các thông tin về nguồn đo, giới hạn Lighthouse và phương pháp audit vẫn được giữ trong báo cáo.

JSON bổ sung trường **`branding`**, gồm cả logo dạng data URL, và trường **`context`** khi báo cáo thuộc dự án (ID/tên khách hàng và dự án). CSV thực tế có 16 cột: tám cột công việc ban đầu, tên đơn vị, khẩu hiệu, chân trang, khách hàng, dự án, người phụ trách, hạn sửa và trạng thái công việc. Khi không có việc cần sửa, tệp chỉ có hàng tiêu đề. CSV mẫu giữ bốn cột công việc mẫu và thêm ba cột thương hiệu. Dữ liệu đo đã lưu không bị thay đổi khi chỉnh thương hiệu; các tệp đã tải trước đó giữ nguyên.

Cấu hình chung nằm trong **`data/branding.json`** (hoặc `AUDIT_DATA_DIR/branding.json`) và được giữ qua khởi động lại. Báo cáo thuộc dự án sẽ dùng thương hiệu riêng của khách hàng nếu đã đặt, hoặc kế thừa cấu hình chung hiện tại. Ảnh sai định dạng, quá dung lượng/kích thước hoặc đường dẫn ảnh từ website ngoài bị từ chối. Cấu hình hỏng được giữ lại để kiểm tra thay vì tự ghi đè.

## Khách hàng và dự án

Trong **Khách hàng & dự án**, tạo khách hàng với tên, liên hệ và ghi chú, rồi tạo dự án thuộc khách hàng đó. Mỗi dự án có tên, ghi chú và từ 1 đến 10 URL công khai, mỗi dòng một URL. Có thể sửa dự án để đổi khách hàng; các báo cáo đã gắn sẽ dùng khách hàng và thương hiệu mới khi xuất lần tiếp theo.

Trong chi tiết dự án:

- Bấm **Kiểm tra website này** để chạy audit với thiết bị/phạm vi đang chọn ở Tổng quan và tự lưu báo cáo vào dự án. Ở Tổng quan cũng có thể chọn **Dự án cho lần kiểm tra** trước khi chạy. Báo cáo cũ được gắn/gỡ bằng danh sách chọn trong dự án, hoặc đổi dự án ngay trên phần đầu báo cáo. Lịch sử có bộ lọc theo dự án.
- Bấm **Theo dõi mỗi tuần** để tạo lịch Mobile, tối đa 5 trang cho URL đó. Các tùy chọn khác và thao tác đọc cảnh báo nằm ở **Theo dõi**. Có thể gắn lịch có sẵn vào dự án; các lượt chạy về sau tự lưu báo cáo vào dự án đang gắn. Các báo cáo cũ của lịch không tự chuyển dự án. Lịch đang chạy cần hoàn tất trước khi đổi liên kết.
- Xem báo cáo, lịch theo dõi và cảnh báo chưa đọc của đúng dự án. Cùng một URL có thể xuất hiện trong nhiều dự án; liên kết được chỉ định rõ, không tự gán theo tên miền.
- **Việc cần sửa** tổng hợp từ báo cáo mới nhất của từng URL đầu vào đã gắn, với tìm kiếm theo tên việc/người phụ trách/URL và lọc trạng thái. Lưu người phụ trách, hạn sửa và **Chưa làm / Đang làm / Đã xong**; hoàn thành được đồng bộ với danh sách công việc thông thường. Hạn sửa quá ngày hiện tại (giờ Bangkok) hiện nhãn Quá hạn. Các thông tin này lưu theo báo cáo và không tự chuyển sang lần audit mới. Trạng thái công việc không thay đổi điểm hay kết luận đo; chạy lại audit để xác minh sửa lỗi.
- Bấm **Đặt/Sửa thương hiệu khách hàng** để cấu hình nhận diện riêng. **Dùng cấu hình chung** bỏ cấu hình riêng và kế thừa cấu hình chung hiện tại. PDF/HTML ghi tên khách hàng/dự án; CSV/JSON kèm thông tin quản lý và công việc.

Mỗi báo cáo/lịch theo dõi được gắn tối đa một dự án. **Gỡ** chỉ bỏ liên kết. **Xóa dự án** có xác nhận, gỡ các liên kết và giữ báo cáo/lịch trong Lịch sử và Theo dõi; cần chờ lượt kiểm tra của dự án đang chạy kết thúc. Chỉ xóa được khách hàng sau khi chuyển hoặc xóa các dự án của họ. Tên, liên hệ, thương hiệu riêng và liên kết nằm trong **`data/workspace.json`**; đây là không gian cục bộ dùng chung trên máy, chưa có tài khoản hay phân quyền cho từng khách hàng.

## Kiểm tra toàn bộ dự án

Trong chi tiết dự án, chọn **Mobile / Desktop** và tối đa **1 / 5 / 10 trang mỗi website**, rồi bấm **Kiểm tra toàn bộ dự án**. Hàng đợi chụp lại danh sách URL ở thời điểm bắt đầu, chạy tuần tự và kiểm tra lại chính sách mạng cho từng URL. Mỗi website có trạng thái và tiến độ riêng; báo cáo thành công được lưu ngay vào dự án và Lịch sử. Website lỗi không ngăn các website còn lại được kiểm tra.

**Hủy hàng đợi** dừng website đang chạy và các website đang chờ, giữ báo cáo đã hoàn tất. **Thử lại website chưa xong** tạo một lần chạy mới với danh sách URL và cấu hình của lần đã chọn: giữ các báo cáo thành công trước đó, chỉ chạy lại website lỗi/bị hủy. Do đó thời gian đo có thể khác nhau; từng kết quả ghi rõ thời gian. Bấm nút kiểm tra toàn bộ một lần nữa để đo mới tất cả URL hiện tại của dự án.

Trong khi hàng đợi chạy, các lượt audit thủ công và lịch theo dõi khác chờ; yêu cầu chạy ngay được từ chối với thông báo đang bận. Hoàn tất hoặc hủy trước khi sửa/xóa dự án. Đóng tab hoặc tải lại trang không dừng hàng đợi: mở lại dự án để xem tiến độ. Máy chủ cần tiếp tục chạy. Nếu máy chủ dừng/khởi động lại, lần kiểm tra được đánh dấu **Bị gián đoạn**, giữ kết quả đã lưu và chờ bạn bấm thử lại; không tự quét lại website.

**Kết quả tổng hợp** xếp website theo điểm tăng dần và đưa việc chưa hoàn tất có ưu tiên cao lên trước. Không gộp điểm các website vì nguồn đo/phạm vi có thể khác nhau. Website lỗi, bị hủy, chưa đo được điểm, hoặc đã bị xóa/gỡ báo cáo hiển thị `—` và lý do; không được tính là đạt. Danh sách công việc của một lần tổng hợp lấy đúng các báo cáo của lần đó, trong khi mục Việc cần sửa ở cuối dự án vẫn dùng báo cáo mới nhất của từng URL.

Sau khi hoàn tất hoặc hủy, có thể xuất **PDF / HTML / CSV / JSON** cho lần đã chọn. Bản xuất dùng thương hiệu hiện tại của khách hàng, liệt kê cả website thiếu kết quả và các việc cần sửa. PDF/HTML có logo, thời gian đo, phạm vi và nguồn tốc độ; JSON có dữ liệu tổng hợp; CSV có 19 cột, gồm hàng website và hàng công việc (phân biệt ở cột Loại). Tên người phụ trách, hạn sửa và trạng thái việc được đọc tại thời điểm xuất. Nếu báo cáo đã bị xóa hoặc chuyển dự án, nội dung của nó không được đưa vào bản tổng hợp nữa.

Hàng đợi và lịch sử các lần chạy nằm trong **`data/batches.json`**. Xóa dự án xóa lịch sử hàng đợi của dự án đó và vẫn giữ các báo cáo/lịch theo dõi độc lập. Hàng đợi và việc theo dõi định kỳ cùng dùng một lượt audit tại một thời điểm.

## So sánh các lần kiểm tra dự án

Trong chi tiết dự án, chọn **Lần trước** và **Lần sau** ở phần **So sánh các lần kiểm tra**. Chỉ chọn các lượt đã kết thúc; mốc trước phải cũ hơn mốc sau. Ứng dụng ghép theo URL đầu vào, hiển thị điểm từng website, chênh lệch và đầy đủ các vấn đề **Lỗi mới / Còn tồn tại / Đã sửa / Chưa xác minh**. Mở phần thay đổi để xem URL và lý do, hoặc mở báo cáo gốc ở mỗi mốc.

Website tăng/giảm điểm chỉ được tính khi tổng điểm có thể so sánh theo nguồn đo, thiết bị, bộ kiểm tra và danh sách trang/liên kết. Việc đã sửa được xác minh riêng theo quy tắc + URL; dấu hoàn thành công việc không chứng minh website đã được sửa. Website thiếu báo cáo, chạy lỗi, bị hủy hoặc báo cáo đã xóa/gỡ/chuyển dự án vẫn giữ trạng thái chưa đủ dữ liệu. Báo cáo được giữ lại khi thử lại hàng đợi không được coi là phép đo mới. URL mới thêm hoặc không còn trong lượt sau được ghi riêng, không tự tính thành lỗi mới hay đã sửa.

**Xu hướng điểm theo website** cho chọn từng URL và **Theo tuần / Theo tháng**. Biểu đồ và bảng số liệu lấy 12 kỳ kết thúc ở lần sau đã chọn, từ tối đa 100 lượt đã kết thúc trong cùng dự án. Tuần bắt đầu thứ Hai, dùng múi giờ UTC+7. Mỗi kỳ dùng kết quả mới nhất theo thời gian đo; lượt lỗi/thiếu báo cáo hiển thị `—`. Báo cáo được dùng lại chỉ đóng góp tại thời điểm đo gốc. Kỳ trống hoặc nguồn/phạm vi không tương thích có khoảng ngắt, không nối thành xu hướng liên tục. Không tính điểm trung bình chung của dự án.

**PDF / HTML** dùng thương hiệu khách hàng hiện tại, chứa biểu đồ của website/khoảng thời gian đang chọn và đầy đủ thay đổi của mọi website, gồm thời gian đo, phạm vi, nguồn và bằng chứng. HTML hoạt động độc lập. **JSON** có cả hai bộ xu hướng và lựa chọn ở `selectedTrend`; **CSV** có 22 cột, phân biệt hàng Website, Thay đổi và Xu hướng, gồm dữ liệu tuần/tháng của mọi URL. Chọn lại website hoặc tuần/tháng trước khi tải PDF/HTML để đổi biểu đồ trong bản xuất.

## Lịch kiểm tra tự động cho dự án

Trong chi tiết dự án, mở **Lịch kiểm tra dự án**, bấm **Tạo lịch dự án**, chọn chu kỳ **Mỗi ngày (24 giờ)** hoặc **Mỗi tuần (7 ngày)**, thiết bị Mobile/Desktop và phạm vi 1/5/10 trang mỗi website rồi lưu. Mỗi dự án có một lịch. Lần tự động đầu tiên sau một chu kỳ kể từ lúc tạo; **Chạy lịch ngay** dùng cấu hình của lịch, kiểm tra mới toàn bộ URL và tính ngày chạy tiếp theo từ lúc bắt đầu. Mỗi lượt lấy danh sách URL hiện tại của dự án. Thời gian hiển thị theo UTC+7.

**Máy chủ ứng dụng cần đang chạy.** Bộ lập lịch kiểm tra mỗi phút và chọn lịch đến hạn cũ nhất giữa lịch dự án và lịch từng website. Tất cả dùng chung một lượt audit; khi đang bận, lịch vẫn giữ ngày đến hạn và chờ lượt trống. Mở lại máy chủ sẽ chạy một lượt cho mỗi lịch quá hạn, không chạy dồn các kỳ bỏ lỡ. Lượt bị gián đoạn được ghi nhận và giữ các báo cáo đã hoàn tất; không tự phát lại phần việc đang dở. Bấm Chạy lịch ngay hoặc dùng thử lại trong hàng đợi khi cần.

**Tạm dừng lịch dự án** dừng các lượt tự động tiếp theo, không hủy lượt đang chạy. **Hủy lượt theo lịch** hủy hàng đợi hiện tại và giữ báo cáo đã xong. Bật lại một lịch quá hạn đặt ngày chạy mới sau một chu kỳ. Có thể sửa thiết bị, phạm vi hoặc chu kỳ khi không có lượt của lịch đang chạy. Đổi chu kỳ tính lại ngày chạy; đổi thiết bị/phạm vi giữ lịch đã định và các phép so sánh sẽ kiểm tra lại điều kiện tương thích.

Lần chạy hoàn tất toàn bộ đầu tiên tạo mốc. Các lượt tiếp theo đối chiếu với **lần hoàn tất toàn bộ gần nhất do lịch tạo**. Lượt có website lỗi, bị hủy hoặc thiếu báo cáo không thay thế mốc này. Cảnh báo được tạo khi tổng điểm hoặc điểm Tốc độ giảm **từ 5 điểm** ở một website, có lỗi mới được xác minh theo quy tắc + URL, hoặc lượt chạy không hoàn tất. Website mới, URL chưa quét lại, thiếu báo cáo hoặc khác nguồn đo/thiết bị/phạm vi hiển thị chưa đủ dữ liệu; không suy ra lỗi đã sửa. Hủy chủ động không tạo thêm cảnh báo lỗi.

Cảnh báo nằm trong phần **Cảnh báo dự án**, có nút mở kết quả và so sánh đúng hai mốc. Số chưa đọc hiện trên thẻ dự án, menu Khách hàng & dự án và biểu tượng chuông. **Đánh dấu đã đọc** được lưu qua tải lại/khởi động lại. Giữ 30 cảnh báo và 50 lượt theo lịch gần nhất; toàn bộ hàng đợi vẫn nằm ở **Kiểm tra toàn bộ dự án**, gồm xuất PDF/HTML/CSV/JSON theo thương hiệu khách hàng. Thông tin cảnh báo ghi nhận kết quả tại thời điểm chạy; bản so sánh được tính lại theo các báo cáo còn gắn trong dự án khi mở.

Lịch, mốc, lịch sử và trạng thái đã đọc nằm trong **`data/project-schedules.json`**, được ghi nguyên tử. Mỗi hàng đợi theo lịch có mã lượt để phục hồi sau khởi động lại mà không tạo trùng cảnh báo. **Xóa lịch** có xác nhận, xóa cấu hình/cảnh báo của lịch và giữ toàn bộ hàng đợi, báo cáo. **Xóa dự án** xóa cả lịch của dự án, giữ các báo cáo độc lập. Cảnh báo hiển thị trong ứng dụng; chưa gửi email hoặc thông báo khi ứng dụng đóng.

## Theo dõi định kỳ

Trong **Theo dõi**, mỗi website có lịch **24 giờ / 7 ngày**, cấu hình Mobile/Desktop và tối đa 1/5/10 trang. Lần tự động đầu tiên diễn ra sau một chu kỳ; **Chạy ngay** tạo báo cáo ngay và tính chu kỳ mới từ lúc bắt đầu lượt đó. Bạn có thể sửa cấu hình, tạm dừng/bật lịch, hủy lượt đang chạy hoặc xóa theo dõi. Xóa theo dõi vẫn giữ báo cáo trong Lịch sử. Đổi URL đặt lại mốc và lịch sử theo dõi của dự án; báo cáo cũ vẫn còn trong Lịch sử.

**Máy chủ ứng dụng cần đang chạy để thực hiện lịch.** Bộ lập lịch kiểm tra mỗi phút, chạy lần lượt và chờ lượt audit đang hoạt động. Sau khi mở lại, mỗi website quá hạn được chạy một lần; không chạy dồn tất cả các chu kỳ đã bỏ lỡ. Lượt bị gián đoạn được thử lại sau khởi động; lịch đang tạm dừng vẫn giữ nguyên. Một lần chạy lỗi hoặc hủy chuyển lịch sang chu kỳ tiếp theo, tránh tự thử liên tục.

Cảnh báo lưu trong ứng dụng và hiện số chưa đọc ở mục Theo dõi/biểu tượng chuông khi:

- Tổng điểm hoặc điểm Tốc độ giảm **từ 5 điểm** so với lần thành công trước.
- Cùng URL xuất hiện liên kết 404/5xx hoặc vấn đề SEO mới sau lần trước đã đạt.
- Lượt theo dõi không hoàn tất do lỗi; hủy chủ động chỉ cập nhật trạng thái lượt chạy.

Lần thành công đầu tiên tạo mốc so sánh. Điểm giảm chỉ được cảnh báo khi hai phép đo đủ điều kiện đối chiếu (nguồn, thiết bị, phạm vi và bộ kiểm tra phù hợp). URL mới kiểm tra hoặc phản hồi chưa xác minh không chứng minh lỗi mới/đã sửa. Biểu đồ lưu tối đa **12 lần thành công** gần nhất, ngắt đường nối khi thiếu điều kiện so sánh; bảng chi tiết mở được từng báo cáo. Mỗi website lưu **20 cảnh báo** gần nhất và trạng thái đã đọc. Các vấn đề cũ vẫn nằm trong báo cáo dù lần theo dõi mới không có cảnh báo thay đổi.

Cấu hình, lịch và cảnh báo nằm trong **`data/monitors.json`** và tồn tại sau khi khởi động lại. Cảnh báo hiện ở ứng dụng; hiện chưa cấu hình gửi email hoặc dịch vụ chạy trên cloud.

## Các kiểm tra

| Hạng mục | Nội dung                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tốc độ   | Lighthouse: điểm Performance, FCP, LCP, CLS, TBT, Speed Index và cơ hội tối ưu; TTFB HTTP, HTML và kích thước ảnh        |
| Mobile   | Viewport, tràn ngang, chữ nhỏ hơn 12px, vùng bấm có một chiều dưới 24px; ảnh chụp 390 × 844 và desktop 1440 × 900        |
| Liên kết | Tối đa 40 URL: trạng thái HTTP, 404/5xx, chuyển hướng; 401/403/429 và lỗi mạng được ghi là **chưa xác minh**             |
| SEO      | Title, meta description, H1, alt ảnh, canonical, ngôn ngữ, noindex, Open Graph, tiêu đề trùng, robots.txt và sitemap XML |

SEO đọc HTML trả về từ máy chủ, trên các trang cùng origin đã thu thập. Crawler đọc liên kết nội bộ và URL trong sitemap dạng `urlset`; không đệ quy sitemap index. Các URL tạo bằng JavaScript trên trang đầu cũng được bổ sung vào lượt kiểm tra liên kết, nhưng không được crawler tự mở thêm để đọc SEO. Liên kết chứa query không được crawler dùng làm trang SEO mới.

Crawler tuân theo các quy tắc Allow/Disallow của robots.txt đã đọc cho các trang con và URL nội bộ được thử. URL đầu vào do bạn chỉ định và các lượt render ảnh trang đầu vẫn được tải. Khi robots.txt không đọc được và không trả 404, crawler chỉ đọc trang đầu. Tối đa 25 ứng viên trang HTML được thử, 40 liên kết và 240 giây mỗi lượt. Lighthouse có giới hạn riêng 75 giây, 160 yêu cầu và 30 MB. Không bảo đảm đã tìm hết mọi trang trên website.

**Mobile và số liệu từ trình duyệt chỉ kiểm tra trang đầu.** Dù chọn desktop để đo tốc độ, ứng dụng vẫn mở một ngữ cảnh mobile thật riêng để đánh giá giao diện, không chỉ thay kích thước cửa sổ desktop.

## Phạm vi của điểm số

**Điểm Tốc độ lấy trực tiếp từ Lighthouse 12.8.2** khi đo thành công, với cấu hình Mobile (Slow 4G mô phỏng) hoặc Desktop của Lighthouse. FCP/LCP/CLS/TBT/Speed Index trong tab Tốc độ cùng lấy từ lần đo này. TTFB là phép đo HTTP độc lập. Danh sách cơ hội tối ưu hiển thị ước lượng và tài nguyên liên quan; các ước lượng có thể trùng nhau, không cộng dồn. Cơ hội tối ưu được thêm vào danh sách việc cần sửa và bản xuất CSV/HTML/PDF/JSON. Không cần PageSpeed API key.

Các hạng mục Mobile/Liên kết/SEO dùng trọng số của Website Audit Kit: đạt = 100%, cảnh báo = 50%, lỗi = 0%. Điểm tổng là trung bình các hạng mục có dữ liệu. Mục thông tin không tính điểm; hạng mục chưa có số liệu hiển thị `—`. Nếu Lighthouse không chạy được, báo cáo ghi rõ lý do và dùng điểm Tốc độ nội bộ; số đo cũ vẫn đọc được và không được gắn nhãn Lighthouse.

Lighthouse chạy thật trên trình duyệt cục bộ, qua cầu nối HTTP giới hạn để giữ chính sách mạng an toàn. Cầu nối dùng user agent Lighthouse, yêu cầu phản hồi không nén và giải nén khi máy chủ vẫn trả nội dung nén; không chuyển cookie hoặc phiên đăng nhập. Phép kiểm tra nén văn bản của Lighthouse được bỏ qua để tránh báo sai do cầu nối. Dung lượng mô phỏng, cache, giao thức, chuyển hướng, streaming và thời gian có thể khác truy cập trực tiếp. Vì vậy điểm **có thể khác PageSpeed Insights**, không phải dữ liệu người dùng thực tế (CrUX) và không đo INP thực tế. Dùng PageSpeed Insights/CrUX để đối chiếu trải nghiệm người dùng.

So sánh dựa trên **quy tắc + URL**, không dựa trên dấu hoàn thành công việc. “Lỗi mới” cần lần trước đã đạt; URL mới quét lần đầu nằm ở “Chưa đủ dữ liệu”. “Đã sửa” cần cùng URL được kiểm tra lại và đạt. URL bị bỏ khỏi phạm vi, HTTP 403/429/timeout, thay đổi thiết bị hoặc nguồn đo không chứng minh lỗi đã sửa. Lỗi tiêu đề trùng cần quét lại đầy đủ các trang từng trùng. Điểm chỉ tính chênh lệch khi nguồn đo, thiết bị, bộ kiểm tra và danh sách URL phù hợp; số lượng trang bằng nhau chưa đủ để coi là cùng phạm vi.

Vùng bấm được kiểm tra sơ bộ bằng hình học, chưa xét mọi ngoại lệ WCAG. Canonical được kiểm tra sự hiện diện và cú pháp URL HTTP/HTTPS, chưa xác minh trang canonical đích. HTTP 2xx không bảo đảm nội dung đúng: soft 404, CAPTCHA và trang yêu cầu đăng nhập có thể chưa được nhận ra. Thời gian sửa là ước lượng tham khảo. Đánh dấu hoàn thành không tự kiểm chứng website và không thay đổi điểm của báo cáo đã lưu.

## Dữ liệu và kết nối

- Máy chủ chỉ lắng nghe `127.0.0.1`; các request từ host hoặc origin ngoài được từ chối.
- Báo cáo JSON và ảnh chụp nằm ở **`data/reports/<id>/`**. Không có analytics, API AI hay dịch vụ lưu báo cáo bên ngoài. Font được đóng gói cục bộ.
- Khi kiểm tra, ứng dụng kết nối tới website và các tài nguyên công khai của trang đó. Không dùng cookie, mật khẩu hay phiên đăng nhập của trình duyệt cá nhân. Các context trình duyệt được tạo riêng.
- URL HTTP/HTTPS công khai ở cổng tiêu chuẩn được hỗ trợ. Chặn địa chỉ riêng, loopback, link-local, metadata và địa chỉ DNS không công khai; DNS được ghim vào kết nối và mỗi chuyển hướng được kiểm tra lại.
- Render chỉ cho phép GET/HEAD, chặn POST, WebSocket và service worker. Website cần API POST để hiển thị nội dung có thể có ảnh chụp hoặc kết quả không đầy đủ; báo cáo ghi lại các tài nguyên bị chặn/không tải được.
- Lighthouse dùng context riêng và cầu nối `SafeNetwork`; mọi request không đi qua cầu nối bị proxy từ chối, kể cả popup/worker. Tắt báo cáo lỗi/telemetry của Lighthouse. Không mở cổng debug Chrome ra mạng.
- Có giới hạn số yêu cầu, dung lượng phản hồi, thời gian và một lần kiểm tra đang chạy. Tài nguyên nén gzip/deflate/Brotli được giải nén trong giới hạn dung lượng.
- HTML xuất ra được escape, không chèn HTML gốc của website. CSV vô hiệu hóa công thức có thể đến từ văn bản website. API xuất PDF chạy cục bộ.
- Lịch sử có thể chứa URL công khai và ảnh chụp trang. Dùng nút xóa trong Lịch sử để xóa cả báo cáo lẫn ảnh.

Biến môi trường tùy chọn:

| Biến                   | Mặc định | Ý nghĩa                                                                                                           |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `PORT`                 | `4318`   | Cổng máy chủ                                                                                                      |
| `AUDIT_DATA_DIR`       | `./data` | Thư mục dữ liệu (đường dẫn tương đối tính từ nơi khởi chạy)                                                       |
| `BROWSER_EXECUTABLE`   | tự tìm   | Đường dẫn Edge/Chrome/Chromium tùy chỉnh                                                                          |
| `AUDIT_ALLOW_LOOPBACK` | tắt      | Đặt `1` **chỉ khi phát triển/kiểm thử** để cho phép localhost, 127.0.0.1 và ::1. Các mạng riêng khác vẫn bị chặn. |

## Kiểm tra dự án

```powershell
npm test
npm run build
npm run test:e2e
npm run test:monitors
npm run test:branding
npm run test:projects
npm run test:batches
npm run test:batches:real
npm run test:batch-comparison
npm run test:batch-comparison:real
npm run test:project-schedules
npm run test:project-schedules:real
```

- `npm test`: kiểm tra về đối chiếu lỗi/phạm vi/nguồn đo, chuẩn hóa kết quả Lighthouse, URL/SSRF, DNS ghim, HTTP nén, giới hạn dung lượng, hủy request, phân tích HTML, robots.txt, tính điểm, bảo vệ bản xuất, theo dõi định kỳ, thương hiệu, khách hàng/dự án, liên kết, công việc, hàng đợi, so sánh tuần/tháng và lịch audit dự án (đến hạn, chống chạy trùng, ghi lỗi, phục hồi, cảnh báo và xóa giữ báo cáo).
- `npm run test:e2e`: chạy Lighthouse Mobile/Desktop thật, website fixture, URL tạo bằng JavaScript, 404/403, robots, SEO, ảnh chụp, lưu việc qua reload, PDF/JSON/HTML/CSV, so sánh lần quét trước/sau khi sửa website, bộ lọc, axe trên hai giao diện mới, mobile 390px, xóa, hủy và các giới hạn mạng. Dữ liệu thử nằm trong thư mục tạm rồi được xóa; ảnh QA/PDF lưu ở `artifacts/`.
- `npm run test:monitors`: tạo/sửa/tạm dừng lịch theo dõi qua giao diện, hai lượt Lighthouse thật trước/sau khi sửa fixture, cảnh báo SEO, biểu đồ và so sánh, đọc cảnh báo qua reload, tiến độ/hủy, xóa và giữ báo cáo; axe trên các trạng thái mới và giao diện 390px. Sử dụng thư mục dữ liệu tạm.
- `npm run test:branding`: kiểm tra tải cấu hình chậm, logo hợp lệ/sai/quá lớn, PNG/JPEG/WebP, lưu qua reload, đặt mặc định, xóa logo và tải PDF/HTML/CSV/JSON; xác minh HTML mở độc lập, chữ dài/màu trắng, dữ liệu audit gốc và CSV dạng bảng. Axe trên cấu hình, lỗi tải logo, xem trước và menu xuất, gồm mobile 390px. Báo cáo dùng dữ liệu giả lập trong thư mục tạm; ảnh và tệp xuất QA nằm ở `artifacts/branding-*`.
- `npm run test:projects`: tạo/sửa/chuyển/xóa khách hàng và dự án, gắn báo cáo, audit có dự án, công việc từ lần mới nhất, người phụ trách/hạn/trạng thái, lịch và cảnh báo, thương hiệu riêng/kế thừa, PDF/HTML/CSV/JSON và bảo toàn báo cáo/lịch khi xóa. Dùng bộ chạy audit giả lập trong dữ liệu tạm; axe trên các trạng thái mới và mobile 390px. Ảnh/PDF QA nằm ở `artifacts/project*`.
- `npm run test:batches`: dùng audit giả lập trong dữ liệu tạm để kiểm tra chạy tuần tự, website lỗi, thử lại chọn lọc, giữ báo cáo, hủy sau khi tải lại trang, bản xuất có thương hiệu và công việc, axe trên các trạng thái hàng đợi và mobile 390px. Ảnh/PDF QA nằm ở `artifacts/batch*`.
- `npm run test:batches:real`: tạo dự án trong dữ liệu tạm và chạy hai URL fixture liên tiếp qua giao diện bằng Lighthouse Mobile thật; kiểm tra điểm/nguồn Lighthouse, liên kết báo cáo, JSON tổng hợp và axe.
- `npm run test:batch-comparison`: dùng lịch sử giả lập trong dữ liệu tạm để kiểm tra mốc trước/sau, đầy đủ thay đổi, website mới/bị bỏ/lỗi/dùng lại báo cáo, xu hướng tuần/tháng, bảng số liệu, xuất PDF/HTML/CSV/JSON theo thương hiệu, cập nhật khi gỡ báo cáo, tải lại/đổi dự án, mở báo cáo gốc, axe và mobile 390px.
- `npm run test:batch-comparison:real`: chạy hai lần audit dự án bằng Lighthouse Mobile thật, đổi website fixture ở giữa và xác minh lỗi mô tả đã sửa, lỗi H1 mới theo cùng URL, phạm vi/nguồn điểm và giao diện so sánh.
- `npm run test:project-schedules`: kiểm tra tạo/sửa/tạm dừng/bật lịch qua giao diện, lưu lịch qua khởi động lại máy chủ, lượt chạy ngay và lượt tự đến hạn, cảnh báo giảm điểm/lỗi mới, đã đọc qua tải lại, mở đúng cặp so sánh/kết quả, JSON tổng hợp, website lỗi, hủy, xóa giữ lịch sử, axe và mobile 390px. Dùng đồng hồ điều khiển và runner giả lập trong thư mục dữ liệu tạm.
- `npm run test:project-schedules:real`: dùng cùng luồng lịch dự án, chạy Lighthouse Mobile thật cho lượt chạy ngay và lượt tự đến hạn, thay fixture giữa hai lượt, xác minh cảnh báo H1 mới và mô tả đã sửa; kiểm tra lịch sử, bản tổng hợp, axe và mobile.
- `node scripts/accessibility.mjs`: kiểm tra WCAG A/AA bằng axe trên tổng quan desktop/mobile, các tab chi tiết, việc cần sửa, bộ lọc, lịch sử và hộp hướng dẫn (ứng dụng cần đang chạy ở cổng 4318).
- `node scripts/screenshot.mjs`: ảnh desktop/mobile và kiểm tra lỗi JavaScript/tràn ngang (cần máy chủ đang chạy).
- `node scripts/public-smoke.mjs [https://example.com]`: chạy thử trên URL công khai với dữ liệu tạm, không ghi vào lịch sử của người dùng.
- `node scripts/verify-lighthouse.mjs`: xác minh nội dung nén vẫn render, chặn POST/chuyển hướng nội bộ/worker/popup/WebSocket, hủy và timeout Lighthouse.

Đã xác minh ngày **23/10/2026**: build production, 22 unit tests, Lighthouse Mobile/Desktop thật, toàn bộ luồng end-to-end (gồm sửa website rồi quét lại), axe WCAG A/AA trên 10 màn hình cũ và hai giao diện mới, giao diện 390px không tràn ngang, bộ kiểm tra giới hạn mạng/hủy/timeout Lighthouse và quét Lighthouse thật trên `https://example.com`. Kết quả kiểm tra công khai có thể thay đổi theo website và mạng.

Xác minh bổ sung ngày **24/10/2026**: build production, 32 unit tests, toàn bộ luồng audit/xuất báo cáo cũ và bộ end-to-end theo dõi mới đều đạt. Hai lượt Lighthouse thật tạo được cảnh báo SEO sau khi fixture thay đổi; xác minh lưu cấu hình/trạng thái đã đọc qua reload, biểu đồ, so sánh, tiến độ/hủy, xóa theo dõi và giữ báo cáo. Axe đạt trên các trạng thái theo dõi (gồm sửa cấu hình, chạy và hộp xóa), 10 màn hình cũ và giao diện mobile 390px; không có lỗi JavaScript hoặc tràn ngang trong các luồng đã kiểm tra.

Xác minh phần thương hiệu ngày **24/10/2026**: build production, 40 unit tests và toàn bộ end-to-end audit (Lighthouse Mobile/Desktop thật, xuất báo cáo, so sánh trước/sau, mobile, hủy và xóa) đều đạt. Bộ kiểm tra thương hiệu xác minh lưu cấu hình qua reload, ba định dạng logo, giới hạn tải lên, khôi phục mặc định, PDF/HTML/CSV/JSON, HTML độc lập và axe trên desktop/mobile. PDF A4 được render và xem đủ bốn trang để kiểm tra logo, chân trang, số trang và ngắt nội dung. Đã thêm thử lại thao tác thay thế tệp trên Windows khi tệp tạm thời bị khóa; vẫn ghi nguyên tử và giữ nguyên dữ liệu cũ nếu không ghi được.

Xác minh phần khách hàng và dự án ngày **24/10/2026**: build production, 48 unit tests, bộ end-to-end audit Lighthouse Mobile/Desktop thật (gồm gắn báo cáo mới vào dự án) và bộ kiểm tra thương hiệu đều đạt. Bộ end-to-end dự án dùng audit giả lập để kiểm tra quản lý khách hàng/dự án, gắn báo cáo/lịch, công việc, cảnh báo, thương hiệu riêng/kế thừa, chuyển khách hàng và xóa mà vẫn giữ báo cáo/lịch. Axe đạt trên các trạng thái mới và mobile 390px, không có lỗi JavaScript hoặc tràn ngang. PDF theo khách hàng đã được render và xem đủ bốn trang; logo, ngữ cảnh dự án, người phụ trách, hạn sửa, chân trang và số trang hiển thị đúng.

Xác minh hàng đợi dự án ngày **24/10/2026**: build production, 55 unit tests, bộ giao diện hàng đợi, bộ quản lý khách hàng/dự án và luồng audit cũ đều đạt. Hai website fixture được kiểm tra liên tiếp bằng Lighthouse Mobile thật, báo cáo được gắn vào dự án và tổng hợp đúng. Đã kiểm tra hủy/thử lại chọn lọc, phục hồi sau khởi động lại, lỗi ghi tiến độ, website bị chặn và bảo toàn báo cáo. Axe đạt ở hàng đợi trống/đang chạy/có lỗi/hoàn tất/đã hủy và mobile 390px; không có lỗi JavaScript hoặc tràn ngang trong các luồng đã kiểm tra. PDF tổng hợp giả lập theo thương hiệu khách hàng đã được render và xem đủ năm trang, kiểm tra logo, ngữ cảnh dự án, người phụ trách, hạn sửa, chân trang và số trang.

Xác minh so sánh dự án ngày **24/10/2026**: build production, 63 unit tests, bộ giao diện so sánh và hồi quy hàng đợi đều đạt. Hai lượt audit dự án bằng Lighthouse Mobile thật xác minh đúng lỗi mô tả đã sửa và lỗi H1 mới trên cùng URL. Đã kiểm tra mốc sai thứ tự, website lỗi/bị bỏ/thêm mới, dùng lại báo cáo, gỡ báo cáo khi đang xem, tải lại/đổi dự án và mở báo cáo gốc. Axe đạt trên desktop, mobile 390px và HTML độc lập; không có lỗi JavaScript hoặc tràn ngang trong các luồng đã kiểm tra. PDF so sánh có thương hiệu đã được render và xem đủ 16 trang với 44 thay đổi giả lập, biểu đồ tháng đang chọn, bằng chứng, chân trang, số trang và kiểm tra giới hạn chữ. Dữ liệu thử dùng thư mục tạm, không đưa vào lịch sử người dùng.

Xác minh lịch dự án ngày **25/10/2026**: build production và 77 unit tests đều đạt. Bộ giao diện lịch xác minh tạo/sửa/tạm dừng/bật lại, lưu qua khởi động lại, chạy ngay và tự đến hạn, chống chạy trùng, cảnh báo giảm điểm/lỗi mới, mở đúng cặp so sánh, đọc cảnh báo, lịch sử, website lỗi, hủy và xóa giữ báo cáo. Hai lượt Lighthouse Mobile thật xác minh lỗi H1 mới và mô tả đã sửa sau khi đổi fixture. Hồi quy hàng đợi, so sánh dự án (gồm PDF/HTML/CSV/JSON) và theo dõi từng website bằng Lighthouse thật đều đạt. Axe đạt trên các trạng thái mới và mobile 390px; không có lỗi JavaScript hoặc tràn ngang trong các luồng đã kiểm tra. Các bộ kiểm tra dùng thư mục dữ liệu tạm. Đã tăng thời gian chờ tải PDF so sánh trong bài kiểm tra lên 60 giây để phù hợp bản nhiều trang trên máy bận.

## Cấu trúc

```text
src/                 React + TypeScript, giao diện và báo cáo mẫu
server/network.mjs   HTTP có giới hạn, DNS ghim, chặn mạng riêng
server/analyzer.mjs  Crawler, SEO, liên kết, kiểm tra và điểm số
server/monitor.mjs   Lịch theo dõi, mốc so sánh, lịch sử điểm và cảnh báo
server/branding.mjs  Cấu hình nhận diện, kiểm tra logo và lưu thương hiệu
server/workspace.mjs Khách hàng, dự án, liên kết, ngữ cảnh xuất và công việc
server/workspace-routes.mjs API quản lý khách hàng và dự án
server/batch.mjs     Hàng đợi audit dự án, lưu trạng thái, hủy/thử lại và tổng hợp
server/project-schedules.mjs Lịch audit dự án, mốc so sánh, cảnh báo và phục hồi lượt chạy
server/batch-comparison.mjs Đối chiếu các lần chạy, bảo vệ dữ liệu thiếu và xu hướng tuần/tháng
server/batch-comparison-export.mjs PDF/HTML/CSV so sánh theo thương hiệu khách hàng
server/batch-export.mjs PDF/HTML và CSV tổng hợp theo thương hiệu khách hàng
server/browser.mjs   Playwright, mobile/desktop, số liệu và PDF
server/lighthouse.mjs Lighthouse thật qua cầu nối mạng có kiểm soát
server/comparison.mjs Đối chiếu quy tắc + URL, phạm vi và nguồn đo
server/store.mjs     Ghi nguyên tử, khóa báo cáo và các cấu hình cục bộ
server/export.mjs    HTML và CSV
server/index.mjs     Express API và static frontend
scripts/             Chế độ dev và kiểm tra end-to-end
tests/               Node test runner
data/                Dữ liệu cục bộ (gitignore)
```

Lưu ý phụ thuộc: đã cập nhật các bản vá tương thích qua `overrides` cho Sentry và basic-ftp. `npm audit` còn cảnh báo từ `extract-zip` (qua công cụ tải trình duyệt của Puppeteer), hiện chưa có bản vá upstream; ứng dụng chỉ dùng trình duyệt cài sẵn, không gọi tải/giải nén trình duyệt. Không dùng `npm audit fix --force` để hạ Lighthouse/Puppeteer xuống bản không tương thích.
