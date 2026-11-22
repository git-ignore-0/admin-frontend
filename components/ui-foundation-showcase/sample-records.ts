export const recordCategories = ["Đất và dinh dưỡng", "Giống cây", "Theo dõi đồng ruộng"];

export const recordStatuses = {
  success: "Đã duyệt",
  pending: "Chờ duyệt",
  warning: "Cần theo dõi",
  danger: "Tạm dừng",
  info: "Đang ghi nhận",
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
export type SampleRecord = RecordFields & { id: string };

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
        : "Quan sát mẫu tại hiện trường và cập nhật kết quả sau kỳ theo dõi tiếp theo.",
  }),
);

export function recordId(number: number) {
  return `NFV-${String(number).padStart(3, "0")}`;
}

export function recordHref(id: string) {
  return `#record-${id}`;
}
