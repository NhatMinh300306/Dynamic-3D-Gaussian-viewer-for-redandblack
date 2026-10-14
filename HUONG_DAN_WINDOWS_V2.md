# Gaussian Studio 1.1 — mở web là phát redandblack

Bản cập nhật cho thư mục Windows hiện tại của bạn. Giữ nguyên dữ liệu tại:

`D:\Downloads\Gaussian_Studio_Spark_Dynamic_LapisGS_CAGS\gaussian-web-studio\model\8i\redandblack\dynamic-lapis`

## 1. Cập nhật từ bản cũ

1. Trong cửa sổ CMD đang chạy server, nhấn **Ctrl+C** để dừng.
2. Giải nén ZIP mới vào một thư mục tạm.
3. Mở thư mục `gaussian-web-studio` trong bản mới. Sao chép **nội dung bên trong** vào thư mục `gaussian-web-studio` cũ ở đường dẫn trên. Chọn **Replace the files in the destination** khi Windows hỏi thay file code trùng tên.
4. **Giữ nguyên thư mục `model`, các dataset trong `public/data`, `.venv` và `node_modules` của bạn.** Không xóa dự án cũ rồi thay cả thư mục. ZIP không chứa dữ liệu redandblack và không ghi đè manifest redandblack của bạn.
5. Bản cập nhật không đổi thư viện, nên không cần cài lại package nếu đã cài bản trước.

Nếu không muốn chép đè code: dùng bản mới ở thư mục riêng rồi chép `model` từ bản cũ vào bên trong `gaussian-web-studio` mới. Cách này tốn thêm dung lượng dữ liệu.

## 2. Cách chạy dễ nhất

Trong `gaussian-web-studio`, nhấp đúp **START_WINDOWS.cmd**.

- Cần Node.js đã cài trên máy (máy đã chạy bản trước thì thường đã có).
- Script dùng bản build đi kèm: không cần `npm ci`, Python hoặc kích hoạt `.venv`.
- Script tự mở trình duyệt sau khi server bắt đầu lắng nghe.
- **Giữ cửa sổ CMD mở.** Đóng nó hoặc Ctrl+C sẽ dừng server.
- Trang chủ tự nhận dữ liệu, tải frame đầu, đưa mô hình vào khung rồi **tự phát và lặp**. Không nhập manifest, không bấm upload và không bấm Play.

Hoặc chạy CMD như trước:

```bat
cd /d "D:\Downloads\Gaussian_Studio_Spark_Dynamic_LapisGS_CAGS\gaussian-web-studio"
npm.cmd start
```

Mở **http://127.0.0.1:5173/** (không dùng bookmark có `?manifest=...` của bản thử cũ).

Nếu chưa cài các thư viện để dùng chế độ source, chạy `npm.cmd ci` một lần trước `npm.cmd start`. Nếu cổng 5173 đang được dùng, dừng server cũ; hoặc `npm.cmd start -- --port 5180` rồi mở port 5180.

Sau khi cập nhật, nhấn **Ctrl+F5** trong trình duyệt để tải giao diện mới.

## 3. Dữ liệu được đọc ở đâu?

Server tự tìm bốn thư mục, nằm cùng cấp:

| Resolution | Thư mục bên trong `model\8i\redandblack\dynamic-lapis` |
|---|---|
| res1 | `redandblack_res1` |
| res2 | `redandblack_res2` |
| res4 | `redandblack_res4` |
| res8 | `redandblack_res8` |

Trong mỗi thư mục res, các file được dùng là:

```text
1450\point_cloud\iteration_30000\point_cloud.ply
dynamic_1451\point_cloud\iteration_30000\point_cloud.ply
dynamic_1452\point_cloud\iteration_30000\point_cloud.ply
...
```

Server đọc trực tiếp PLY gốc, không chép lại hàng GB dữ liệu. Nó chỉ chọn tên `point_cloud.ply` tại iteration đã cấu hình và kiểm tra header Gaussian; **bỏ qua `input.ply`**. File nguồn không bị sửa.

Nếu chỉ có res1 thì chỉ res1 sử dụng được. Ba nút còn lại bị mờ. Để đổi đủ bốn mức, cần kết quả đã train của đủ cả bốn res. Web không tự sinh res2/res4/res8 từ res1.

Các mức phải có **cùng frame ID**. Mức nào thiếu hoặc lệch frame sẽ bị mờ; rê chuột lên nút để xem lý do, hoặc mở ⚙ → Nguồn dữ liệu. Server giữ nguyên chuỗi dài nhất, không âm thầm rút ngắn tất cả các mức theo phần giao.

Sau khi bổ sung dữ liệu, dừng và chạy lại server để quét lại thư mục. Nếu thiếu frame ở giữa chuỗi, bổ sung frame hoặc cấu hình khoảng `start`/`end` liên tục.

Nếu không tìm thấy PLY tại cấu trúc `model` trên, server thử manifest đã import trong `public/data/redandblack-multi`, `redandblack`, `redandblack-res8`, `redandblack-res1`. Ưu tiên dữ liệu từ `model` khi tìm thấy; vì vậy không cần import lại các mức khi có đủ thư mục gốc.

## 4. Giao diện mới

| Vị trí | Chức năng |
|---|---|
| Trên cùng | res1 / res2 / res4 / res8; Render FPS; nút ⚙ |
| Thanh nhỏ phía dưới | Play/pause, trước/sau, timeline, FPS nội dung, Speed |
| Cạnh phải | Zoom +, Zoom −, vừa khung hình, toàn màn hình |
| Nút ⚙ | Xoay XYZ, vị trí XYZ, tỷ lệ, hệ trục, lưới và lặp |
| ⚙ → Hiệu năng & thông số | Prefetch, render scale, buffer, stall, CSV |
| ⚙ → Nguồn dữ liệu | Manifest, mở PLY thủ công, demo tổng hợp, hướng dẫn |

**Đổi resolution vẫn giữ đúng frame và tiếp tục phát nếu trước đó đang phát.** Trong khi tải mức mới, frame cũ được giữ để tránh màn hình trống. Nếu bạn đang tạm dừng thì đổi res vẫn tạm dừng để so sánh.

Cuộn chuột để zoom, kéo chuột trái để xoay, chuột phải để dịch. Nhấn **F** hoặc nút ⌖ để vừa khung nếu zoom quá xa hoặc quá gần. Phím **Space** phát/dừng; **+ / −** zoom; **← / →** chuyển frame và tạm dừng.

Phạm vi zoom đã mở rộng theo kích thước cảnh. Gần: 0,0001 lần bán kính bao cảnh; xa: 2000 lần. Mặt phẳng cắt camera được điều chỉnh theo khoảng cách. Zoom quá sát có thể đi vào trong mô hình, khi đó nhấn F.

## 5. Nhân vật đứng đúng chiều và nhớ tọa độ

Web ưu tiên góc xoay trong manifest cũ đã import nếu có. Khi chưa có manifest cũ, mặc định dùng **[-90, 0, 0] độ**, theo tình huống dữ liệu Z-up mà bạn đã gặp.

- Nếu chưa đúng: ⚙ → Hệ trục → **Z-up → Y-up**.
- Nếu đầu chúc xuống: đặt **X = 90**, Y = 0, Z = 0 trong Xoay mô hình.
- Vị trí XYZ thay đổi vị trí cả mô hình; các frame dùng cùng phép biến đổi.
- Nhấn F sau khi chỉnh để đưa nhân vật vào khung.

Các chỉnh sửa XYZ/tỷ lệ được tự lưu trên **trình duyệt hiện tại**, theo tên scene. Người dùng khác không tự nhận các chỉnh sửa trong localStorage của bạn.

Muốn đặt mặc định chung cho mọi người mở web:

1. Sao chép `viewer.config.example.json` thành **viewer.config.json** ở thư mục có `package.json`.
2. Sửa như sau (ví dụ):

```json
{
  "iteration": 30000,
  "fps": 30,
  "defaultQuality": "res8",
  "rotationDegrees": [-90, 0, 0],
  "position": [0, 0, 0],
  "scale": 1
}
```

3. Dừng và chạy lại server, tải lại trang.
4. Nếu trình duyệt đã nhớ tọa độ cũ, bấm **Khôi phục** trong ⚙ để dùng mặc định mới.

Có thể thêm `"start": 1450` và `"end": 1479` để chỉ lấy khoảng đó; end bao gồm frame cuối. Các tùy chọn config này áp dụng cho cơ chế tự nhận dữ liệu gốc `model/`; nếu dùng manifest đã import thì sửa trực tiếp manifest đó.

## 6. Tự phát và tốc độ

Trang chủ ưu tiên res8 nếu có để giảm tải lúc mở; nếu không có thì dùng mức có dữ liệu phù hợp. Mặc định tự phát, lặp và Speed 1×. Bạn có thể đặt `defaultQuality` trong config.

“Tự phát” nghĩa là không cần thao tác Play sau khi dữ liệu sẵn sàng; vẫn phải chờ tải và giải mã frame đầu. Dung lượng PLY và GPU máy khách ảnh hưởng thời gian chờ. Không có dữ liệu thật trong ZIP, nên trên máy chưa chép dataset, trang sẽ báo cách đặt dữ liệu thay vì hiển thị demo thay thế.

Bộ đếm thời gian đã giữ lại phần thời gian dư giữa các lần vẽ, giảm chậm do bộ định thời ở bản cũ. Player vẫn giữ từng frame khi giải mã chưa kịp; không bảo đảm 30 FPS với mọi file/máy. FPS nội dung là tốc độ yêu cầu, Render FPS là nhịp vẽ.

## 7. Khi chỉ thấy một resolution / vẫn là giao diện cũ

- Kiểm tra đang mở trang chủ `http://127.0.0.1:5173/`, bỏ `?manifest=./data/redandblack-test/...` khỏi URL.
- Kiểm tra các thư mục res2/res4/res8 nằm đúng cấp với res1.
- Dữ liệu là output Gaussian đầy đủ, không phải point cloud 8i gốc hoặc CAGS nén.
- Kiểm tra cùng iteration và cùng khoảng frame giữa bốn mức.
- Dừng server cũ rồi chạy server từ thư mục đã cập nhật.
- Nhấn Ctrl+F5.

## 8. Build, demo và phạm vi kiểm tra

Bản build đi kèm `dist` đã có UI mới. Nếu sau này sửa code trong `app`, chạy:

```bat
npm.cmd run build
```

`npm.cmd start` đọc source app; `START_WINDOWS.cmd` đọc dist. Cả hai đều tự đọc model qua server Node. Trên host hoàn toàn tĩnh (không dùng Node server này), cần import dataset vào `public/data/redandblack` rồi build và tải cả dist lên host; thư mục model không tự đi vào dist.

Demo tổng hợp vẫn có tại `http://127.0.0.1:5173/?manifest=./data/demo/manifest.json`; đó không phải 8i redandblack.

Đã kiểm tra tự nhận bốn res bằng dữ liệu tổng hợp đúng cấu trúc, đồng bộ frame ID, bỏ qua input.ply, HTTP Range, fallback manifest, bộ định thời, decoder Spark và build. Chưa chạy trên Windows/Chrome với dataset thật của bạn trong môi trường tạo gói.
