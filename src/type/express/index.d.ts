// src/types/express/index.d.ts

import { IUser } from '../../interfaces/models/user'; // Hoặc một interface user tinh gọn hơn
import { ISite } from '../../models/Site'; // Import ISite interface

declare global {
  namespace Express {
    export interface Request {
      user?: IUser; // Hoặc kiểu AuthenticatedUser
      site?: ISite; // Thêm site property để lưu thông tin site từ TenantResolver
    }
  }
}