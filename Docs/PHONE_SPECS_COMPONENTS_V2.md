# Strapi Components cho Phone Specifications (PhoneArena Structure)

**Dựa trên PhoneArena + GSMArena analysis**

**Strategy: GENERIC NAMES để reuse cho nhiều categories (Phones, Laptops, Tablets, Monitors, etc.)**

---

## ✅ SHARED COMPONENTS (9 components - dùng chung)

### 1. Component: `specs.availability`

**Category:** specs
**Display Name:** Availability
**Icon:** ic-availability

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Announced | Text (Short) | No | Sep 09, 2025 |
| Status | Text (Short) | No | Available. Released 2025, September 19 |
| Prices | Text (Long) | No | 12GB/256GB - $1199 \| €1449<br>12GB/512GB - $1399 \| €1699 |

**Reuse for:** Phones, Laptops, Tablets, Monitors, TVs, Appliances

---

### 2. Component: `specs.design`

**Category:** specs
**Display Name:** Design
**Icon:** ic-design

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Dimensions | Text (Long) | No | 6.43 x 3.07 x 0.34 inches<br>163.4 x 78.0 x 8.75 mm |
| Weight | Text (Short) | No | 8.22 oz / 233.0 g |
| Materials | Text (Long) | No | Back: Glass (Ceramic Shield)<br>Frame: Aluminum |
| Build | Text (Long) | No | Glass front, aluminum frame |
| Resistance | Text (Short) | No | Water, Dust; IP68 |
| Biometrics | Text (Short) | No | 3D Face unlock, Fingerprint (under display) |
| Keys | Text (Long) | No | Left: Volume control<br>Right: Lock/Unlock key |
| Colors | Text (Long) | No | Silver, Cosmic Orange, Deep Blue |

**Notes:**
- Merge GSMArena "Body" + PhoneArena "Design"
- `Biometrics`, `Keys` optional (không phải device nào cũng có)
- Laptops dùng: Dimensions, Weight, Materials, Build, Colors

**Reuse for:** Phones, Laptops, Tablets, Smartwatches, Monitors, TVs

---

### 3. Component: `specs.display`

**Category:** specs
**Display Name:** Display
**Icon:** ic-display

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Size | Text (Short) | No | 6.9-inch, 91.60% screen-to-body |
| Type | Text (Long) | No | OLED, Variable 1-120Hz, HDR, 3000 nits |
| Resolution | Text (Short) | No | 2868x1320px, 19.5:9 ratio, 458 PPI |
| Protection | Text (Short) | No | Gorilla Glass Ceramic 2 |
| Features | Text (Long) | No | HDR10+, Always-on display, Oleophobic coating |

**Notes:**
- Generic enough cho phones, laptops, tablets, monitors
- Monitors sẽ có thêm: Panel type (IPS/VA), Response time, Curvature

**Reuse for:** Phones, Laptops, Tablets, Smartwatches, Monitors, TVs

---

### 4. Component: `specs.hardware`

**Category:** specs
**Display Name:** Hardware
**Icon:** ic-hardware

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| SystemChip | Text (Short) | No | Apple A19 Pro (3 nm) |
| Processor | Text (Short) | No | Hexa-core (2x4.26 GHz + 4x3.2 GHz) |
| GPU | Text (Short) | No | Apple 6-core GPU |
| Memory | Text (Long) | No | 12GB/256GB<br>12GB/512GB<br>12GB/1TB |
| StorageExpansion | Text (Short) | No | not expandable, microSD up to 1TB |
| OS | Text (Short) | No | iOS (26.x), Android 15 |

**Notes:**
- Merge GSMArena "Platform" + "Memory"
- PhoneArena style: tất cả hardware trong 1 component
- Laptops: `Memory` sẽ là "16GB DDR5", `StorageExpansion` là "2x M.2 slots"

**Reuse for:** Phones, Laptops, Tablets, Smartwatches

---

### 5. Component: `specs.battery`

**Category:** specs
**Display Name:** Battery
**Icon:** ic-battery

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Type | Text (Short) | No | 5088 mAh, Li-Ion |
| Capacity | Text (Short) | No | 5000 mAh |
| Charging | Text (Long) | No | Fast charging, Qi2 wireless charging<br>Reverse wireless charging |
| ChargeSpeed | Text (Short) | No | Wired: 40.0W, Wireless: 25.0W |

**Notes:**
- `Type` và `Capacity` có thể overlap, giữ cả 2 để flexible
- Laptops: `Type` = "90 Wh, 4-cell Li-polymer"

**Reuse for:** Phones, Laptops, Tablets, Smartwatches, Earbuds

---

### 6. Component: `specs.camera`

**Category:** specs
**Display Name:** Camera
**Icon:** ic-camera

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Rear | Text (Short) | No | Triple camera |
| MainCamera | Text (Long) | No | 48 MP (Sensor-shift OIS, PDAF)<br>Aperture: F1.8, Focal length: 24mm |
| SecondCamera | Text (Long) | No | 48 MP (Ultra-wide)<br>Aperture: F2.2, Focal: 13mm |
| ThirdCamera | Text (Long) | No | 48 MP (Telephoto, Periscope, 4x zoom)<br>Aperture: F2.8 |
| FourthCamera | Text (Long) | No | (optional for Quad camera) |
| Flash | Text (Short) | No | Dual LED |
| VideoRecording | Text (Long) | No | 4K@120fps, 1080p@240fps<br>HDR10+, Dolby Vision |
| FrontCamera | Text (Long) | No | 18 MP (ToF, Autofocus)<br>Video: 4K@60fps |

**Notes:**
- Merge GSMArena "Main Camera" + "Selfie Camera"
- PhoneArena style: tất cả camera trong 1 component
- `Rear` field để note số lượng: Single/Dual/Triple/Quad/Penta

**Reuse for:** Phones, Tablets (Laptops dùng `specs.webcam` riêng)

---

### 7. Component: `specs.connectivity`

**Category:** specs
**Display Name:** Connectivity & Features
**Icon:** ic-connectivity

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Bluetooth | Text (Short) | No | 6.0, A2DP, LE |
| WLAN | Text (Long) | No | Wi-Fi 6, Wi-Fi 6E, Wi-Fi 7<br>Wi-Fi Direct, Hotspot |
| USB | Text (Short) | No | Type-C, USB 3.2, DisplayPort |
| Sensors | Text (Long) | No | Accelerometer, Gyroscope, Compass<br>Barometer, Proximity sensor |
| Location | Text (Long) | No | GPS, GLONASS, Galileo, BeiDou, QZSS |
| Other | Text (Long) | No | NFC, Ultra Wideband (UWB), Infrared |

**Notes:**
- Merge GSMArena "Comms" + "Features"
- PhoneArena style: connectivity + sensors trong 1 component
- Laptops cũng có: Bluetooth, WLAN, USB, Sensors (accelerometer, gyro)

**Reuse for:** Phones, Laptops, Tablets, Smartwatches

---

### 8. Component: `specs.multimedia`

**Category:** specs
**Display Name:** Multimedia
**Icon:** ic-multimedia

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Headphones | Text (Short) | No | No 3.5mm jack, USB-C audio |
| Speakers | Text (Short) | No | Stereo speakers, Dual speakers |
| AudioFeatures | Text (Long) | No | Dolby Atmos, Hi-Res Audio certified<br>Spatial audio support |

**Notes:**
- GSMArena gọi là "Sound", PhoneArena gọi là "Multimedia"
- Dùng "Multimedia" vì professional hơn

**Reuse for:** Phones, Laptops, Tablets, Monitors

---

### 9. Component: `specs.regulatory`

**Category:** specs
**Display Name:** Regulatory & Compliance
**Icon:** ic-regulatory

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| FCCApproval | Text (Short) | No | Date: Sep 09, 2025<br>FCC ID: BCG-E8950A |
| SARHead | Text (Short) | No | 1.19 W/kg |
| SARBody | Text (Short) | No | 1.19 W/kg |
| SARSimultaneous | Text (Short) | No | 1.59 W/kg |
| Certifications | Text (Long) | No | CE, FCC, Energy Star, EPEAT Gold |

**Notes:**
- PhoneArena tách riêng "Regulatory Approval" khỏi Misc
- GSMArena để SAR trong "Misc"
- Đặt tên "Regulatory" để cover cả phones & laptops (laptops có Energy Star, EPEAT)

**Reuse for:** Phones, Laptops, Tablets, Monitors, TVs, Appliances

---

## ❌ PHONE/TABLET SPECIFIC COMPONENTS (1 component)

### 10. Component: `specs.cellular`

**Category:** specs
**Display Name:** Cellular (Mobile Network)
**Icon:** ic-cellular

| Field Name | Type | Required | Example |
|------------|------|----------|---------|
| Bands5G | Text (Long) | No | n1, n2, n3, n5, n7, n8, n12... SA, NSA, mmWave |
| Bands4G | Text (Long) | No | 1, 2, 3, 4, 5, 7, 8, 12, 13, 17... |
| Bands3G | Text (Long) | No | HSDPA 850 / 900 / 1700 / 1900 / 2100 |
| Bands2G | Text (Short) | No | GSM 850 / 900 / 1800 / 1900 |
| Technology | Text (Short) | No | GSM / CDMA / HSPA / LTE / 5G |
| DataSpeed | Text (Short) | No | LTE-A, 5G (up to 10 Gbps) |
| SIMType | Text (Short) | No | Nano-SIM + eSIM, Dual eSIM |
| VoLTE | Text (Short) | No | Yes |
| VoWiFi | Text (Short) | No | Yes |

**Notes:**
- GSMArena gọi là "Network", PhoneArena gọi là "Cellular"
- Dùng "Cellular" vì clear hơn (network có thể hiểu là WiFi)
- CHỈ phones và tablets có

**Reuse for:** Phones, Tablets only

---

## 📊 Comparison: GSMArena vs PhoneArena vs Final

| GSMArena (15) | PhoneArena (10) | Final (10) | Reusability |
|---------------|-----------------|------------|-------------|
| Launch | Availability | **availability** | ✅ All devices |
| Body | Design | **design** | ✅ All devices |
| Display | Display | **display** | ✅ All devices |
| Platform + Memory | Hardware | **hardware** | ✅ Computing devices |
| Battery | Battery | **battery** | ✅ Portable devices |
| Main Camera + Selfie | Camera | **camera** | ✅ Phones/Tablets |
| Comms + Features | Connectivity | **connectivity** | ✅ All devices |
| Sound | Multimedia | **multimedia** | ✅ All devices |
| Misc (SAR) | Regulatory | **regulatory** | ✅ All devices |
| Network | Cellular | **cellular** | ❌ Phones/Tablets only |
| Tests | (Benchmarks) | (Separate table) | - |
| EU Label | - | (Future) | - |

---

## 🎯 Usage in Strapi

### Item Content Type - Add Dynamic Zone:

```json
{
  "Specifications": {
    "type": "dynamiczone",
    "components": [
      "specs.availability",
      "specs.design",
      "specs.display",
      "specs.hardware",
      "specs.battery",
      "specs.camera",
      "specs.connectivity",
      "specs.multimedia",
      "specs.regulatory",
      "specs.cellular"
    ]
  }
}
```

### Example: Samsung Galaxy S24 (Phone)
Pick components:
- ✅ availability, design, display, hardware, battery, camera, connectivity, multimedia, cellular, regulatory

### Example: MacBook Pro 16 (Laptop)
Pick components:
- ✅ availability, design, display, hardware, battery, connectivity, multimedia, regulatory
- ❌ camera (dùng webcam component riêng), cellular (không có)

### Example: Samsung Odyssey G9 (Monitor)
Pick components:
- ✅ availability, design, display, connectivity, multimedia, regulatory
- ❌ hardware (không có CPU/RAM), battery, camera, cellular

---

## ✅ Summary

**10 components total:**
- **9 shared** (availability, design, display, hardware, battery, camera, connectivity, multimedia, regulatory)
- **1 specific** (cellular - phones/tablets only)

**Benefits:**
- ✅ Generic names → reusable across categories
- ✅ PhoneArena structure → organized & professional
- ✅ Strapi Dynamic Zone → flexible per item
- ✅ Easy to extend → add laptop-specific components later

**Next steps:**
1. Create 10 components in Strapi admin
2. Add Dynamic Zone to Item content type
3. Test with sample data