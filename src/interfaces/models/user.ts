/**
 * Define interface for User Model
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

export interface Tokens {
	kind: string;
	accessToken: string;
	tokenSecret?: string;
}
export interface IUser {
    // Thông tin cốt lõi
    id: number;
    email: string;
    password?: string;      // Mật khẩu nên là tùy chọn, không phải lúc nào cũng cần
    fullname: string;
    site_id: number;

    // Vai trò & Trạng thái
    isAdmin: boolean;
    last_login?: Date;      // Tùy chọn, vì có thể là user mới chưa đăng nhập

    // Thông tin hồ sơ (có thể không bắt buộc)
    picture?: string;
    gender?: string;
    website?: string;
    geolocation?: string;

    // Liên kết mạng xã hội (tùy chọn)
    facebook?: string;
    twitter?: string;
    google?: string;
    github?: string;
    instagram?: string;
    linkedin?: string;
    steam?: string;

    // Dành cho chức năng đặc biệt
    tokens?: Tokens[]; // Mảng các token, có thể là JSON hoặc TEXT trong DB
    affiliate_id?: number | null; // Có thể là null

    // Dành cho việc reset mật khẩu (chỉ dùng khi cần)
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    
}
export default IUser;
