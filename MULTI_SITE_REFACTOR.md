# Multi-Site Refactor Documentation

## Tổng quan

Dự án đã được refactor để hỗ trợ kiến trúc multi-site, trong đó `site_id` trở thành key chính cho tất cả các thao tác admin. Mỗi site sẽ có dữ liệu riêng biệt và được quản lý độc lập.

## Các thay đổi chính

### 1. Database Schema Changes

#### Các bảng đã được thêm `site_id`:
- `transactions`: Thêm `site_id` để theo dõi giao dịch thuộc site nào
- `credit_packages`: Thêm `site_id` để gói credit thuộc về site cụ thể  
- `subscription_plans`: Thay `user_id` bằng `site_id` để rõ ràng hơn
- `pricing_plans`: Thêm `site_id` để kiểm soát quyền truy cập
- `discount_codes`: Thêm `site_id` để mã giảm giá thuộc về site cụ thể

#### Migration Script:
```sql
-- Chạy file migration_site_id.sql để cập nhật database
source migration_site_id.sql;
```

### 2. Model Updates

#### ITransaction Interface:
```typescript
export interface ITransaction {
    id: number;
    user_id: number;
    site_id: number; // ✅ Mới thêm
    type: 'subscription' | 'credit';
    // ... các field khác
}
```

#### ICreditPackage Interface:
```typescript
export interface ICreditPackage {
    id: number;
    site_id: number; // ✅ Mới thêm
    name: string;
    // ... các field khác
}
```

#### ISubscriptionPlan Interface:
```typescript
export interface ISubscriptionPlan {
    id: number;
    site_id: number; // ✅ Thay đổi từ user_id
    name: string;
    // ... các field khác
}
```

#### IPricingPlan Interface:
```typescript
export interface IPricingPlan {
    id: number;
    plan_id: number;
    site_id: number; // ✅ Mới thêm
    price: number;
    // ... các field khác
}
```

#### IDiscountCode Interface:
```typescript
export interface IDiscountCode {
    id: number;
    site_id: number; // ✅ Mới thêm
    code: string;
    // ... các field khác
}
```

### 3. API Changes

#### Tất cả methods trong models đã được cập nhật để hỗ trợ site_id:

**Transaction Model:**
```typescript
// OLD
Transaction.createSubscriptionRequest(userId, pricingPlan, discountInfo)
Transaction.createCreditPurchaseRequest(userId, creditPackage, discountInfo)
Transaction.findAllPending()

// NEW ✅
Transaction.createSubscriptionRequest(userId, siteId, pricingPlan, discountInfo)
Transaction.createCreditPurchaseRequest(userId, siteId, creditPackage, discountInfo)
Transaction.findAllPending(siteId?) // Optional siteId filter
```

**CreditPackage Model:**
```typescript
// NEW methods ✅
CreditPackage.findAll(siteId?)
CreditPackage.findById(id, siteId?)
CreditPackage.create(data) // data must include site_id
CreditPackage.update(id, siteId, data)
CreditPackage.delete(id, siteId)
```

**SubscriptionPlan Model:**
```typescript
// OLD
SubscriptionPlan.findAll({ userId })

// NEW ✅
SubscriptionPlan.findAll({ siteId })
SubscriptionPlan.findAllWithPricingBySite(siteId)
SubscriptionPlan.findByIdAndSite(id, siteId)
SubscriptionPlan.update(id, siteId, data)
SubscriptionPlan.delete(id, siteId)
```

**PricingPlan Model:**
```typescript
// OLD
PricingPlan.create(data) // missing site_id
PricingPlan.findAllByPlanId(plan_id)

// NEW ✅
PricingPlan.create(data) // data must include site_id
PricingPlan.findAllByPlanId(plan_id, siteId?)
PricingPlan.findAllBySiteId(siteId)
PricingPlan.update(id, siteId, data)
PricingPlan.delete(id, siteId)
```

**DiscountCode Model:**
```typescript
// OLD
DiscountCode.findValidCode(code)

// NEW ✅
DiscountCode.findValidCode(code, siteId)
DiscountCode.findAllBySiteId(siteId)
DiscountCode.update(id, siteId, data)
DiscountCode.delete(id, siteId)
```

### 4. Controller Updates

**SiteAdminController đã được cập nhật:**
- Tất cả methods đều check quyền dựa trên site ownership
- Sử dụng SiteUtils để lấy siteId và validate permissions
- Tự động inject site_id vào data khi tạo mới resources

### 5. New Utilities

#### SiteUtils Class:
```typescript
// Get site info từ request
SiteUtils.getSiteId(req): number
SiteUtils.getSite(req): ISite

// Permission checks
SiteUtils.isUserSiteOwner(req, userId): boolean
SiteUtils.hasAdminAccess(req, userId, isGlobalAdmin?): Promise<boolean>

// Data helpers
SiteUtils.addSiteId(data, req): data & { site_id: number }
SiteUtils.prepareSiteData(data, req): cleaned data with site_id
SiteUtils.filterBySite(dataArray, req): filtered array

// Logging & Context
SiteUtils.logWithSiteContext(req, message, data?)
SiteUtils.createSiteContext(req): { site_id, site_domain, site_owner_id }
```

### 6. Middleware Updates

#### TenantResolver Middleware:
- Đã có sẵn, inject `req.site` vào request
- Tự động resolve site dựa trên domain

#### Express Type Definitions:
```typescript
declare global {
  namespace Express {
    export interface Request {
      user?: IUser;
      site?: ISite; // ✅ Mới thêm
    }
  }
}
```

## Usage Examples

### 1. Tạo Subscription Plan mới:
```typescript
// Trong SiteAdminController
public static async createSubscriptionPlan(req: Request, res: Response) {
    const admin = req.user as AuthenticatedAdmin;
    const { name, description, max_concurrent_jobs, options } = req.body;
    
    // ✅ Sử dụng SiteUtils để check permission và lấy siteId
    const hasAccess = await SiteUtils.hasAdminAccess(req, admin.id, admin.isAdmin);
    if (!hasAccess) {
        return res.status(403).json({ error: "Unauthorized" });
    }
    
    // ✅ SiteUtils tự động add site_id
    const planData = SiteUtils.prepareSiteData({
        name, description, max_concurrent_jobs, options
    }, req);
    
    const newPlan = await SubscriptionPlan.create(planData);
    return res.json(newPlan);
}
```

### 2. Lấy danh sách resources theo site:
```typescript
// ✅ Tự động filter theo site hiện tại
const siteId = SiteUtils.getSiteId(req);
const plans = await SubscriptionPlan.findAll({ siteId });
const pricing = await PricingPlan.findAllBySiteId(siteId);
const discounts = await DiscountCode.findAllBySiteId(siteId);
```

### 3. Validate ownership trước khi update/delete:
```typescript
// ✅ Update với site check
const updated = await SubscriptionPlan.update(planId, siteId, updateData);
const deleted = await PricingPlan.delete(pricingId, siteId);
```

## Migration Checklist

### ✅ Completed:
- [x] Database schema updated with site_id columns
- [x] All model interfaces updated 
- [x] All model methods support site_id filtering
- [x] SiteAdminController refactored to use site_id
- [x] SiteUtils utility class created
- [x] Express type definitions updated
- [x] Migration SQL script created

### 🔄 Next Steps:
- [ ] Run migration script on production database
- [ ] Update all API client code to handle new parameter structure
- [ ] Add site_id to any remaining controllers that create/update resources
- [ ] Update test cases to include site_id parameters
- [ ] Update API documentation
- [ ] Add site-level analytics and reporting

## Important Notes

1. **Backward Compatibility**: Các methods cũ sẽ break sau khi migration. Cần update tất cả code gọi các methods này.

2. **Default Site ID**: Migration script sử dụng site_id = 1 làm default. Điều chỉnh nếu cần.

3. **Foreign Key Constraints**: Tất cả bảng đều có foreign key tới `sites(id)` với `ON DELETE CASCADE`.

4. **Performance**: Đã thêm indexes cho site_id columns để optimize performance.

5. **Data Isolation**: Mỗi site chỉ có thể truy cập data của chính mình, đảm bảo tính bảo mật.

## Testing

Để test sau khi migration:

```typescript
// 1. Test site resolution
GET /api/admin/subscription-plans
Host: site1.yourdomain.com
// Should only return plans for site1

// 2. Test cross-site access prevention  
PUT /api/admin/subscription-plans/123
Host: site2.yourdomain.com
// Should fail if plan 123 belongs to site1

// 3. Test admin permissions
// Global admin should access all sites
// Site owner should only access their site
```
