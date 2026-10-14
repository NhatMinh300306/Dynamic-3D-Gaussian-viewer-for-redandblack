# Gaussian Studio — web viewer cho Dynamic-LapisGS và CAGS

Mở cảnh Gaussian trên trình duyệt, xoay/zoom, phát chuỗi frame, đổi mức dữ liệu và xuất log CSV. Renderer là **Spark 2.3.1 + Three.js 0.180.0**, đóng gói tại máy; không phụ thuộc CDN khi chạy.

Đây là mã nguồn độc lập, không phải sản phẩm chính thức của World Labs. Không chứa kết quả huấn luyện của bạn. Demo đi kèm được tạo bằng code, không phải 8i redandblack.

## Bản 1.1 — tự mở redandblack, giao diện gọn

**Hướng dẫn cập nhật trên Windows: [HUONG_DAN_WINDOWS_V2.md](HUONG_DAN_WINDOWS_V2.md).**

Chạy `START_WINDOWS.cmd` hoặc `npm.cmd start` từ thư mục dự án. Trang chủ tự tìm
`model/8i/redandblack/dynamic-lapis/redandblack_res1`, `res2`, `res4`, `res8`,
đọc đúng `point_cloud/iteration_30000/point_cloud.ply` trong từng frame,
rồi tự phát và lặp. Không cần Python hoặc import khi dùng cấu trúc này.
Server đọc trực tiếp file nguồn, không sao chép dataset. Chỉ các file PLY đã kiểm tra
được cung cấp qua HTTP. Các nút res thiếu frame bị vô hiệu hóa, không ghép sai timeline.
Ưu tiên res8 để khởi động nhẹ hơn; đổi res vẫn giữ frame và trạng thái phát.

Giao diện toàn màn hình, thanh phát nhỏ phía dưới, res và Render FPS phía trên.
Nút ⚙ mở bảng XYZ/hệ trục và các thông số nâng cao. Cuộn chuột hoặc +/− để zoom;
F để vừa khung. Mở trang chính sẽ dùng redandblack, không tự thay bằng demo giả.
Nếu chưa có dataset, mở demo bằng `/?manifest=./data/demo/manifest.json`.

Hướng dẫn import thủ công bên dưới vẫn dùng được cho dữ liệu khác và static hosting.

## 1. Bản này làm được gì?

| Chế độ | Dữ liệu | Cơ chế |
|---|---|---|
| Chuỗi động | Các PLY/SPZ/SPLAT/KSPLAT đầy đủ, mỗi thời điểm một file | Tải trước cửa sổ nhỏ, giải mã bằng Spark, phát đúng thứ tự, giữ frame cũ khi frame tiếp chưa sẵn sàng |
| Cảnh RAD | Một cảnh `.rad`, hoặc `.rad` kèm các `.radc` | Spark paging, LoD theo góc nhìn, điều chỉnh ngân sách splat |

Có: play/pause, tua, lặp, tốc độ phát, FPS nội dung, xoay/zoom/pan, vừa khung, chỉnh trục, đổi res1/res2/res4/res8, mở file cục bộ, thống kê và CSV. Chuỗi tự phát sau khi frame đầu sẵn sàng; đặt `"autoplay": false` trong manifest nếu muốn tắt.

**Phạm vi:** đổi quality trong chuỗi là đổi bản đầy đủ của frame, không cộng các enhancement layer. Chưa có ABR tự động, decoder CAGS trong browser, truyền residual CAGS, tile scheduling cho cảnh động, hay nội suy giữa frame. RAD paging áp dụng cho chế độ cảnh; không đồng nghĩa đã giải quyết streaming 4D theo thời gian. Không bảo đảm FPS cố định với các file lớn.

## 2. Chạy nhanh — chưa cần dữ liệu thật

### Cách A: bản đã build, chỉ cần Node

Giải nén ZIP. Mở terminal **tại thư mục có `package.json`**:

```bash
cd gaussian-web-studio
node scripts/server.mjs --dist
```

Mở **http://localhost:5173** để tự phát redandblack. Nếu chưa có dữ liệu, mở **http://localhost:5173/?manifest=./data/demo/manifest.json** để xem demo tổng hợp. Thư mục `dist/` đã chứa JavaScript, Spark, Three.js và demo; cách này không cần `npm install` hay Internet sau khi tải ZIP. Node.js cần phiên bản >=20.19, khuyến nghị Node 24 LTS. Tải từ https://nodejs.org/en/download nếu máy chưa có; kiểm tra bằng `node --version`.

### Cách B: phát triển, thay input hoặc sửa code

```bash
cd gaussian-web-studio
npm ci
npm start
```

Mở **http://localhost:5173**. Chạy `npm ci` một lần sau khi giải nén; cần mạng để tải package. Những lần sau chỉ chạy `npm start`. Đây là chế độ nên dùng khi thay dữ liệu trong `public/data`.

- Dừng server: `Ctrl+C`.
- Không mở `index.html` bằng double-click/file://; module, fetch và Worker cần HTTP server.
- Nếu port bận: `npm start -- --port 5180`, rồi mở http://localhost:5180.
- Trên Windows PowerShell có thể dùng `npm.cmd ci` và `npm.cmd start` nếu `npm.ps1` bị chặn. Không cần thay execution policy.
- Công cụ Python bên dưới chỉ dùng thư viện chuẩn. Ubuntu dùng `python3`; Windows có thể thay bằng `py -3`.

### Thao tác

| Thao tác | Cách dùng |
|---|---|
| Xoay camera | Kéo chuột trái |
| Zoom | Cuộn chuột |
| Dịch camera | Kéo chuột phải |
| Phát / tạm dừng | Nút tròn hoặc Space |
| Frame trước/sau | Hai nút cạnh play hoặc phím ←/→ |
| Vừa khung hình | Nút tương ứng hoặc F |
| Đổi mức dữ liệu | Chọn res; giữ đúng chỉ số frame và tiếp tục phát nếu trước đó đang phát |
| Xuất log | Nút “Xuất CSV” |

## 3. Input nào dùng được?

### Dynamic-LapisGS

Chọn output **mô hình đã train**, không chọn `source/` chứa ảnh, raw point cloud của 8i, `renders/` hoặc checkpoint `.pth`.

Các đường dẫn thường gặp:

```text
model/8i/redandblack/dynamic-lapis/redandblack_res8/1450/point_cloud/iteration_30000/point_cloud.ply
model/8i/redandblack/dynamic-lapis/redandblack_res8/dynamic_1451/point_cloud/iteration_30000/point_cloud.ply
model/8i/redandblack/dynamic-lapis/redandblack_res1/1450/point_cloud/iteration_30000/point_cloud.ply
```

Script nhận `1450`, `dynamic_1451`, `frame1451`, `frame_1451`, hoặc tên file `1451.ply`. Nó kiểm tra các thuộc tính `x/y/z`, `f_dc_*`, `opacity`, `scale_*`, `rot_*` trước khi sao chép. Dữ liệu chứa PLY màu thông thường nhưng không có tham số Gaussian sẽ bị từ chối để tránh xem nhầm raw point cloud.

### CAGS

| Kết quả hiện có | Dùng trực tiếp? | Cần làm |
|---|---|---|
| `point_cloud.ply` đầy đủ sau decode/dequantize/stitch | Có | Import như chuỗi PLY |
| `point_cloud_quantized.ply` + codebook/layer | Không | Dequantize bằng CAGS |
| `.drc`, `.npz`, thư mục tile | Không | Stitch/reconstruct bằng CAGS |
| Dữ liệu inter-frame + mask | Không | Dùng `cags.decode` giữ trạng thái theo thứ tự |

Giữ nguyên output nén và sidecar; không đổi tên `point_cloud_quantized.ply` thành `point_cloud.ply` để lách decoder. Việc chỉ đổi tên không khôi phục thuộc tính Gaussian.

## 4. Thay input Dynamic-LapisGS

Giả sử dữ liệu nằm tại:

```text
/home/minh/results/model/8i/redandblack/dynamic-lapis
```

Đây là **đường dẫn ví dụ**. Thay bằng thư mục thực tế trên máy đang chạy script. Nếu dữ liệu ở A100, cần chuyển kết quả về máy hoặc chạy script tại server rồi chuyển dataset đã chuẩn hóa về. Trình duyệt không đọc trực tiếp đường dẫn `/home/user12/...` trên server từ xa.

### Bước 1 — kiểm tra trước với res8

Trong thư mục dự án:

```bash
python3 scripts/import_sequence.py \
  --root "/home/minh/results/model/8i/redandblack/dynamic-lapis" \
  --scene redandblack \
  --res 8 \
  --start 1450 --end 1479 \
  --iteration 30000 \
  --fps 30 \
  --output public/data/redandblack-res8 \
  --dry-run
```

Kiểm tra số frame và dung lượng dự kiến. Sau đó chạy lại **bỏ `--dry-run`** để tạo dữ liệu. Script chỉ sao chép, không sửa file nguồn.

### Bước 2 — mở trong web

```bash
npm start
```

Nhập vào ô Manifest URL:

```text
./data/redandblack-res8/manifest.json
```

Nhấn nút ↗. Hoặc mở trực tiếp:

```text
http://localhost:5173/?manifest=./data/redandblack-res8/manifest.json
```

### Bước 3 — thêm đủ các res

Sau khi res8 chạy được:

```bash
python3 scripts/import_sequence.py \
  --root "/home/minh/results/model/8i/redandblack/dynamic-lapis" \
  --scene redandblack \
  --res 8 4 2 1 \
  --start 1450 --end 1479 \
  --iteration 30000 --fps 30 \
  --output public/data/redandblack
```

Mở `./data/redandblack/manifest.json`. Các mức res được nhận tự động từ tên thư mục. `res1` là nhãn dữ liệu của pipeline, **không phải độ phân giải canvas** và không tự xác định bitrate.

Script yêu cầu mọi quality có cùng frame ID. Nếu bị thiếu, nên hoàn thiện dữ liệu hoặc thu hẹp `--start/--end`. `--intersection` cho phép chỉ lấy frame chung; `--allow-gaps` cho phép thiếu frame giữa chuỗi nhưng thời gian sẽ bị nén theo số frame còn lại. Không dùng các tùy chọn này khi cần đánh giá đúng timeline gốc.

Output đã tồn tại sẽ không bị ghi đè. Dùng một tên mới, hoặc thêm `--force` để thay dataset do chính script đã tạo. Script không cho output chứa hoặc nằm trong input.

### Thử nhanh không cần import

Nhấn **Mở PLY / SPZ**, chọn các file đầy đủ. Chúng được xử lý tại trình duyệt, không upload lên server. Khi nhiều file đều tên `point_cloud.ply`, nên dùng script để tạo tên riêng theo frame thay vì chọn thủ công. Sắp xếp file cục bộ dựa trên tên, không dựa trên thời điểm sửa file.

## 5. Giải mã và dùng CAGS

Thực hiện giải mã trong environment CAGS đã cài của bạn, thường trên máy có CUDA. Viewer chỉ cần WebGL2; nó không cần CUDA hoặc PyTorch. Không cài CAGS vào dự án npm này.

### A. Một frame đã quantize độc lập

Ví dụ nguồn ở `/home/user12/minh/compressed/frame0`. Sao chép sang nơi reconstruct rồi giải mã để giữ nguyên bản nén:

```bash
conda activate cags
cp -a /home/user12/minh/compressed/frame0 /home/user12/minh/reconstructed-frame0
python -m cags.quantize \
  -s /home/user12/minh/reconstructed-frame0 \
  -d /home/user12/minh/reconstructed-frame0 \
  -i 30000 --draco --dequantize
```

Bỏ `--draco` nếu lúc encode không dùng Draco. Kết quả mong đợi là `point_cloud/iteration_30000/point_cloud.ply` trong thư mục reconstruct. Mã CLI có thể khác giữa các commit; chạy `python -m cags.quantize --help` nếu tùy chọn không khớp.

### B. Nhiều frame độc lập, đã quantize hoặc tile

Chỉ dùng khi mỗi frame được encode độc lập. Công cụ này sao chép toàn bộ metadata và sidecar trước khi gọi CAGS:

```bash
python scripts/reconstruct_cags.py \
  --root /home/user12/minh/compressed \
  --output /home/user12/minh/reconstructed \
  --mode quantize --iteration 30000 --draco --dry-run
```

Bỏ `--dry-run` để thực hiện. Nếu output đến từ `cags.tile`, đổi `--mode quantize` thành `--mode tile`; script sẽ dùng `--stitching` thay vì `--dequantize`. `--output` phải chưa tồn tại. Script chặn khi nhận thấy `.mask.npz` vì đó có thể là dữ liệu inter-frame.

### C. Chuỗi encode bằng `cags.encode` có inter-frame

Phải dùng decoder theo thứ tự. Ví dụ có frame đầu `frame0`, các frame tiếp theo `frame1` đến `frame29`:

```bash
conda activate cags
python -m cags.decode \
  --source_init /home/user12/minh/compressed/frame0 \
  --destination_init /home/user12/minh/reconstructed/frame0 \
  --iteration_init 30000 \
  -s /home/user12/minh/compressed/sequence \
  -d /home/user12/minh/reconstructed/sequence \
  -i 30000 \
  --frame_format "frame%d" \
  --frame_start 1 --frame_end 29 \
  --interframe interframe \
  --draco
```

**Thay các tham số theo encode thực tế**: `--interframe`, `--draco`, `--no_tiling_first`, `--no_tiling_rest` phải tương ứng. `--frame_end` của mã được kiểm tra là **bao gồm frame cuối**. Nếu chuỗi tên `dynamic_1451`, đặt `--frame_format "dynamic_%d"`, `--frame_start 1451`, `--frame_end 1479` và chỉ định đúng frame đầu 1450. Không bắt đầu decode từ giữa chuỗi nếu thiếu trạng thái tham chiếu.

Với `cags.decode`, luôn dùng thư mục đích **khác nguồn**: decoder có thể xóa/recreate thư mục iteration đích. Không áp dụng cách source=destination của dequantize độc lập cho decoder inter-frame.

### D. Import kết quả reconstruct

Sau khi chuyển dữ liệu về laptop:

```bash
python3 scripts/import_sequence.py \
  --root "/home/minh/results/reconstructed" \
  --scene "redandblack · CAGS reconstructed" \
  --iteration 30000 --fps 30 \
  --output public/data/redandblack-cags
```

Mở `./data/redandblack-cags/manifest.json`.

**Ý nghĩa phép đo:** truyền PLY đã giải mã không còn giữ tỷ lệ nén/bitrate đường truyền gốc của CAGS. Đây là kiểm tra trải nghiệm hiển thị của kết quả reconstructed. Muốn nghiên cứu truyền codebook, enhancement layer và residual trực tiếp, cần tích hợp decoder CAGS ở phía client hoặc một kiến trúc khác.

## 6. Mở cảnh RAD giống cơ chế tải theo góc nhìn của Spark

Nếu đã có `my-scene-lod.rad`, chép vào `public/data/my-scene/`. Nếu dùng RAD dạng header + chunk, chép **toàn bộ `.radc` đi cùng**, giữ tên và quan hệ thư mục.

Nhập trực tiếp vào ô URL:

```text
./data/my-scene/my-scene-lod.rad
```

Ở chế độ này, Spark quản lý tải theo vùng nhìn. Dùng chọn “Ngân sách LoD” để thay số splat mục tiêu. Timeline sẽ tắt vì đây là một cảnh, không phải chuỗi thời gian.

Nếu cần đặt camera cụ thể, tạo `public/data/my-scene/manifest.json`:

```json
{
  "version": 1,
  "mode": "scene",
  "name": "My RAD scene",
  "camera": {"position": [0, 1.5, 4], "target": [0, 1, 0]},
  "qualities": [{"id": "lod", "label": "LoD theo góc nhìn"}],
  "frames": [{"id": 0, "assets": {"lod": {"url": "my-scene-lod.rad", "format": "rad"}}}]
}
```

Các tọa độ trên là ví dụ; thay theo scene. Khi không có `camera`, viewer thử vừa khung sau khi có splat được tải. Với cảnh rất lớn, nút vừa khung chỉ có thể xét các splat đã resident/được chọn, không phải toàn bộ thế giới chưa tải.

### Nếu chỉ có PLY và muốn tạo RAD

Theo tài liệu Spark, công cụ `build-lod` nằm trong **repository Spark**, không nằm trong package npm của viewer. Cần Rust/Cargo (https://rust-lang.org/tools/install/). Ví dụ:

```bash
git clone https://github.com/sparkjsdev/spark.git
cd spark/rust/build-lod
cargo run --release -- /absolute/path/point_cloud.ply --quality
```

Output theo tài liệu là `point_cloud-lod.rad`. Kiểm tra help tại commit bạn dùng. Giữ một bản ghi commit khi làm thí nghiệm. Việc tạo RAD từ mỗi frame độc lập chưa tự tạo codec thời gian hay player dynamic RAD; bản viewer này tách cảnh RAD và chuỗi PLY.

## 7. Manifest chuỗi và cách chỉnh input bằng tay

Ví dụ hai frame, hai mức dữ liệu:

```json
{
  "version": 1,
  "mode": "sequence",
  "name": "redandblack",
  "fps": 30,
  "autoplay": true,
  "defaultQuality": "res8",
  "transform": {"rotationDegrees": [0, 0, 0], "scale": 1},
  "qualities": [
    {"id": "res8", "label": "res8"},
    {"id": "res1", "label": "res1"}
  ],
  "frames": [
    {"id": 1450, "assets": {
      "res8": {"url": "res8/001450.ply", "format": "ply"},
      "res1": {"url": "res1/001450.ply", "format": "ply"}
    }},
    {"id": 1451, "assets": {
      "res8": {"url": "res8/001451.ply", "format": "ply"},
      "res1": {"url": "res1/001451.ply", "format": "ply"}
    }}
  ]
}
```

- Mỗi `url` tính từ vị trí của manifest, không từ `index.html`.
- `id` phải khớp thời điểm thật giữa các quality. Không ghép frame0 CAGS với frame1450 gốc nếu chưa ánh xạ lại ID.
- `bytes` có thể thêm vào asset để hỗ trợ giới hạn cửa sổ tải theo kích thước nguồn.
- `rotationDegrees` là Euler XYZ, đơn vị độ. Để xoay Z-up thành Y-up dùng `[-90,0,0]`; không áp dụng mặc định khi chưa biết trục dữ liệu.
- Không chuẩn hóa tâm/kích thước độc lập từng frame vì có thể phá chuyển động. Viewer dùng cùng transform cho toàn bộ chuỗi và chỉ fit camera lúc mở đầu.
- Frame rate phải theo dữ liệu thực. Ví dụ 30 frame ở 30 FPS chỉ là **1 giây** nội dung. Giảm tốc độ phát để kiểm tra chuyển động; không phải tạo thêm frame.

Nếu thư mục không có tên res, import sẽ đặt quality là `original`. Có thể chỉ định các root riêng:

```bash
python3 scripts/import_sequence.py \
  --quality-root "res8=/data/redandblack_res8" \
  --quality-root "res1=/data/redandblack_res1" \
  --scene redandblack --fps 30 \
  --output public/data/redandblack-custom
```

Với chuỗi SPZ đặt `--glob "**/*.spz"`. Script kiểm tra header Gaussian cho PLY; SPZ/SPLAT được decoder Spark kiểm tra lúc nạp.

## 8. Cách đọc số liệu và giới hạn hiệu năng

- **Render FPS:** nhịp gọi render/animation loop của trình duyệt, không phải phép đo thời gian GPU chính xác và không phải FPS nguồn.
- **Buffer:** số frame phía trước đã giải mã, chia cho FPS nội dung và tốc độ phát. GPU upload/sorting tiếp theo vẫn có thể tốn thời gian.
- **Stall:** thiếu frame đã decode ở thời điểm player muốn chuyển frame. Không tính thời gian pause/tua; chưa đo mọi dạng giật phía GPU.
- **Tải file gần nhất:** payload byte / thời gian fetch hoàn tất. Có thể đến từ localhost hoặc cache; không gọi đây là bandwidth Internet. File chọn cục bộ và RAD paging để `—`.
- **Startup ready:** thời gian đến khi frame đầu giải mã xong/được gắn vào scene, không phải phép đo first-pixel GPU chính xác. Với RAD chỉ tương ứng phần khởi tạo metadata.
- CSV ghi thành công các file đã nạp; không tổng hợp byte của request bị hủy hay toàn bộ request nội bộ RAD.

Mặc định chỉ giải mã một file mỗi lần. Prefetch 3 frame; tùy chỉnh 1–8. Dữ liệu nguồn biết kích thước có ngưỡng 192 MiB để giảm cửa sổ (vẫn giữ ít nhất current + next). Đây **không phải giới hạn cứng VRAM**. Trong lúc đổi quality có thể giữ thêm frame cũ, và decoder/GPU có overhead riêng. Tắt tab hoặc đóng trang để giải phóng tài nguyên.

Nếu chậm: thử res8, tải trước 1–2 frame, render scale 0.75, FPS nội dung thấp hơn để kiểm tra, hoặc giảm dung lượng bằng SPZ. Máy có GPU tích hợp vẫn có thể chạy WebGL2; tốc độ phụ thuộc cảnh và driver. Không cần NVIDIA để chạy web, nhưng có thể cần CUDA cho bước CAGS reconstruction.

## 9. Cấu trúc code và chỗ mở rộng nghiên cứu

| File | Vai trò |
|---|---|
| `app/src/main.js` | Scene, camera, Spark, UI, loader và metrics |
| `app/src/model.js` | Kiểm tra manifest, cửa sổ tải và clock phát |
| `app/src/frame-store.js` | Tải tuần tự, chống kết quả cũ sau seek, giữ/loại frame |
| `scripts/import_sequence.py` | Chuẩn hóa và kiểm tra output Gaussian |
| `scripts/reconstruct_cags.py` | Gọi CAGS cho các frame độc lập |
| `scripts/server.mjs` | HTTP server hỗ trợ Range/206 cho RAD |
| `scripts/build.mjs` | Tạo bản web tĩnh tự chứa trong dist |
| `scripts/make_demo.py` | Tạo demo Gaussian động tổng hợp |

Muốn thêm ABR: bổ sung policy quyết định quality trước khi `plan()` tạo danh sách tải. Cần tính kích thước frame, lịch sử tải, buffer, decode cost và sự tương ứng frame ID. Muốn truyền tile/layer cần đổi schema asset và decoder, không chỉ đổi dropdown.

## 10. Build, chia sẻ trong LAN và Docker

Sau khi sửa code hoặc thêm dữ liệu:

```bash
npm run build
npm run preview
```

`dist/` được tạo lại từ `app/` + `public/` + dependency. **Thư mục `model/` không tự được đóng gói trong dist.** Muốn host hoàn toàn tĩnh, import đủ res vào `public/data/redandblack` theo mục 4 rồi build. Cơ chế tự đọc `model/` cần server Node đi kèm; nó hoạt động với cả `npm start` và `--dist`. Bản Node server 1.1 phục vụ dữ liệu `public/data` mới cả ở chế độ `--dist`. Nếu đưa `dist` lên host tĩnh thì cần build lại để đóng gói dữ liệu mới. Build sẽ sao chép toàn bộ dataset, nên cần đủ dung lượng đĩa.

Cho thiết bị cùng LAN truy cập:

```bash
npm start -- --host 0.0.0.0 --port 5173
```

Mở `http://IP_LAN_CUA_MAY:5173` trên thiết bị khác. Hai máy phải truy cập được nhau; firewall có thể cần cho phép port. Bản mặc định chỉ bind 127.0.0.1. Để host Internet, deploy `dist/` lên static hosting có HTTP Range, HTTPS, đúng MIME và cấu hình CORS nếu dữ liệu khác origin. HTTP server đi kèm dùng cho phát triển, không có xác thực hay quản lý nhiều người dùng.

Docker tùy chọn (build sau khi dữ liệu đã nằm trong public):

```bash
docker build -t gaussian-studio:1.0 .
docker run --rm -p 5173:5173 gaussian-studio:1.0
```

Không cần `--gpus`: GPU render nằm ở trình duyệt client.

## 11. Kiểm tra và xử lý lỗi

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Các test bao gồm manifest, timeline, seek trong lúc tải, retry, Range bytes, an toàn đường dẫn và import cấu trúc Lapis/CAGS bằng dữ liệu tổng hợp. Bộ source đã build được. Chưa có kiểm chứng hình ảnh WebGL trên trình duyệt trong môi trường tạo gói và chưa chạy với dữ liệu thật của bạn; không có tuyên bố benchmark 30/60 FPS.

| Lỗi | Kiểm tra |
|---|---|
| Không tải được thư viện | Đã chạy `npm ci` chưa? Có mở qua HTTP không? |
| Manifest 404 | URL bỏ tiền tố `public/`: `public/data/x` được truy cập bằng `/data/x` |
| Thiếu thuộc tính Gaussian | Đang chọn raw point cloud, ảnh render hoặc file CAGS quantized? |
| Trùng frame ID | Root chứa cả original và reconstructed, hoặc nhiều bộ output? |
| Thiếu frame ở một quality | Thu hẹp khoảng thời gian hoặc chỉ import res có đủ frame |
| Cảnh nằm ngang/ngược | Chọn hệ trục phù hợp rồi bấm “Vừa khung hình” |
| Cảnh biến mất sau đổi quality | Kiểm tra cùng hệ tọa độ, cùng frame ID và đúng PLY full |
| Context lost / tab hết bộ nhớ | Giảm res, số frame prefetch, render scale; tải lại trang |
| CAGS decode lỗi config | Đối chiếu đúng mode/tiling/Draco và commit đã encode |
| RAD thiếu chi tiết | Server trả 206 không? Đã chép đủ .radc? Xem Network/Console |

Nếu cần chỉnh riêng theo dữ liệu của bạn, thông tin hữu ích nhất là: đường dẫn 2 frame đầu của mỗi res, header PLY, kích thước file, log Console và phiên bản repo CAGS. Không cần gửi cả bộ dataset để kiểm tra bước đầu.

## 12. Nguồn API và định dạng

- https://sparkjs.dev/docs/
- https://sparkjs.dev/docs/splat-mesh/
- https://sparkjs.dev/docs/lod-getting-started/
- https://github.com/nus-vv-streams/dynamic-lapis-gs
- https://github.com/yindaheng98/ColorAdaptiveGaussianSplatting

Bản 1.1 được cập nhật ngày 14/10/2026. API mới được đối chiếu với source Three.js đã pin và tài liệu chính thức. Phiên bản renderer npm đã được cố định bằng `package-lock.json`.
