export const recordCategories = ["Đất và dinh dưỡng", "Giống cây", "Theo dõi đồng ruộng"];

export const recordStatuses = {
  success: "Đã duyệt",
  pending: "Chờ duyệt",
  warning: "Cần theo dõi",
  danger: "Tạm dừng",
  info: "Đang ghi nhận kết quả theo dõi tại hiện trường",
  neutral: "Bản nháp",
};

export type RecordStatus = keyof typeof recordStatuses;
export type RecordFields = {
  name: string;
  category: string;
  status: RecordStatus;
  location: string;
  notes: string;
};
export type SampleRecord = RecordFields & { id: string; extended?: true };

export const newRecordFields: RecordFields = {
  name: "",
  category: recordCategories[0],
  status: "neutral",
  location: "",
  notes: "",
};

const observations: [string, string, RecordStatus][] = [
  ["Khảo sát độ ẩm lớp phủ", "Khu thử nghiệm ven sông", "pending"],
  ["Thử nghiệm giống cải bẹ xanh", "Vườn ươm phía Đông", "success"],
  ["Theo dõi côn trùng có ích", "Bờ ruộng hướng Nam", "info"],
  ["Đánh giá phân ủ từ phụ phẩm thực vật", "Khu ủ hữu cơ", "warning"],
  ["Lưu hạt giống đậu đũa địa phương", "Kho hạt giống", "neutral"],
  ["Kiểm tra rãnh thoát nước", "Lô đất thấp", "danger"],
  ["So sánh đất phủ rơm và đất trống", "Luống đối chứng", "success"],
  ["Theo dõi nảy mầm của đậu xanh", "Vườn ươm phía Tây", "info"],
  ["Ghi nhận sinh trưởng cây hàng rào", "Đường nội đồng", "pending"],
  ["Đo lại độ tơi xốp sau mùa mưa", "Lô thử nghiệm phía Bắc", "warning"],
  ["Kiểm tra sức sống hạt rau dền", "Kho hạt giống", "neutral"],
  ["Kiểm tra nguồn nước tưới", "Ao thí nghiệm", "success"],
];

const longNotes = [
  "Mục tiêu của đợt theo dõi là so sánh hai cách ủ phụ phẩm thực vật sau thu hoạch. Các đống ủ nằm ở hai vị trí có điều kiện che mưa khác nhau. Mỗi vị trí có một luống đối chứng để tách ảnh hưởng của phương pháp ủ và vị trí đặt luống.",
  "Trong tuần đầu, nhóm đo độ ẩm ở ba độ sâu vào buổi sáng. Kết quả ghi theo mã luống, ngày lấy mẫu và tình trạng bề mặt. Số đo bất thường được đo lại tại chỗ và giữ cả hai giá trị trong bảng theo dõi.",
  "Sau đợt mưa, khối ủ ở rìa phía bắc giữ ẩm lâu hơn. Cần ghi riêng ảnh hưởng của nước chảy từ lối đi và tránh gộp số đo này với nhóm luống có mái che.",
  "Lịch kiểm tra tiếp theo gồm đảo khối ủ vào sáng thứ Hai, đo lại sau 48 giờ và kiểm tra nhiệt độ ở giữa khối. So sánh với số liệu tuần trước trước khi xác nhận tình trạng.",
  "Khu vực lấy mẫu có mã NFV-TRIAL-COMPOST-SEASON-02-BLOCK-NORTH-REFERENCE-2026. Dùng mã này trong ghi chú, biểu mẫu và ảnh hiện trường để tìm lại đầy đủ dữ liệu.",
  "Khi hoàn thành, nhóm ghi rõ các điểm còn sai lệch và lý do chưa thể so sánh trực tiếp. Kết luận sẽ được cập nhật ở lần kiểm tra tiếp theo.",
].join("\n\n");

export const initialRecords: SampleRecord[] = observations.map(
  ([name, location, status], index) => ({
    id: recordId(index + 1),
    name,
    location,
    category: recordCategories[index % recordCategories.length],
    status,
    notes:
      index === 0
        ? "Ghi nhận độ ẩm ở ba điểm lấy mẫu vào buổi sáng. Đối chiếu với luống không phủ sau mỗi lần tưới."
        : index === 3
          ? longNotes
          : "Quan sát mẫu tại hiện trường và cập nhật kết quả sau kỳ theo dõi tiếp theo.",
  }),
);

export const extendedRecords: SampleRecord[] = Array.from({ length: 48 }, (_, index) => {
  const sample = initialRecords[index % initialRecords.length];
  const batch = Math.floor(index / initialRecords.length) + 2;
  return {
    ...sample,
    id: recordId(initialRecords.length + index + 1),
    extended: true,
    name: `${sample.name} trong đợt theo dõi đồng ruộng sau mưa lần ${batch}`,
    location: `${sample.location}, dãy luống phía ngoài cạnh khu đối chứng và điểm lấy mẫu số ${index + 1}`,
  };
});

export function recordId(number: number) {
  return `NFV-${String(number).padStart(3, "0")}`;
}

export function recordHref(id: string) {
  return `#record-${id}`;
}
