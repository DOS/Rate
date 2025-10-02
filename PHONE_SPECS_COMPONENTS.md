# Strapi Components cho Phone Specifications

Dựa trên data crawl từ GSMArena (Samsung S25 Ultra & iPhone 17 Pro Max)

---

## 1. Component: `specs.network`

**Category:** specs
**Display Name:** Network
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Technology | Text (Long text) | No | GSM / CDMA / HSPA / EVDO / LTE / 5G |
| Bands2G | Text (Long text) | No | GSM 850 / 900 / 1800 / 1900 |
| Bands3G | Text (Long text) | No | HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100 |
| Bands4G | Text (Long text) | No | 1, 2, 3, 4, 5, 7, 8, 12, 13, 17, ... |
| Bands5G | Text (Long text) | No | 1, 2, 3, 5, 7, 8, 12, 20, 25, ... |
| Speed | Text (Short text) | No | HSPA, LTE, 5G |

---

## 2. Component: `specs.launch`

**Category:** specs
**Display Name:** Launch
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Announced | Text (Short text) | No | 2025, January 22 |
| Status | Text (Short text) | No | Available. Released 2025, February 03 |

---

## 3. Component: `specs.body`

**Category:** specs
**Display Name:** Body
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Dimensions | Text (Short text) | No | 162.8 x 77.6 x 8.2 mm |
| Weight | Text (Short text) | No | 218 g (7.69 oz) |
| Build | Text (Long text) | No | Glass front (Gorilla Armor 2), glass back |
| SIM | Text (Long text) | No | Nano-SIM + eSIM + eSIM |

---

## 4. Component: `specs.display`

**Category:** specs
**Display Name:** Display
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Type | Text (Long text) | No | Dynamic LTPO AMOLED 2X, 120Hz, HDR10+ |
| Size | Text (Short text) | No | 6.9 inches, 116.9 cm2 |
| Resolution | Text (Short text) | No | 1440 x 3120 pixels, 19.5:9 ratio |
| Protection | Text (Short text) | No | Corning Gorilla Armor 2 |

---

## 5. Component: `specs.platform`

**Category:** specs
**Display Name:** Platform
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| OS | Text (Short text) | No | Android 15, One UI 7 |
| Chipset | Text (Short text) | No | Snapdragon 8 Elite (3 nm) |
| CPU | Text (Long text) | No | Octa-core (2x4.47 GHz + 6x3.53 GHz) |
| GPU | Text (Short text) | No | Adreno 830 (1200 MHz) |

---

## 6. Component: `specs.memory`

**Category:** specs
**Display Name:** Memory
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| CardSlot | Text (Short text) | No | No |
| Internal | Text (Long text) | No | 256GB 12GB RAM, 512GB 12GB RAM, 1TB 16GB RAM |

---

## 7. Component: `specs.main-camera`

**Category:** specs
**Display Name:** Main Camera
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Modules | Text (Long text) | No | 200 MP wide + 10 MP tele + 50 MP periscope + 50 MP ultrawide |
| Features | Text (Long text) | No | Laser AF, LED flash, auto-HDR, panorama |
| Video | Text (Long text) | No | 8K@24/30fps, 4K@30/60/120fps, HDR10+ |

**Note:** Field "Modules" thay thế cho "Quad"/"Triple"/"Dual" để flexible hơn

---

## 8. Component: `specs.selfie-camera`

**Category:** specs
**Display Name:** Selfie Camera
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Modules | Text (Long text) | No | 12 MP, f/2.2, 26mm (wide), dual pixel PDAF |
| Features | Text (Short text) | No | HDR, HDR10+ |
| Video | Text (Long text) | No | 4K@30/60fps, 1080p@30fps |

---

## 9. Component: `specs.sound`

**Category:** specs
**Display Name:** Sound
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Loudspeaker | Text (Short text) | No | Yes, with stereo speakers |
| Jack35mm | Text (Short text) | No | No |

---

## 10. Component: `specs.comms`

**Category:** specs
**Display Name:** Comms
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| WLAN | Text (Long text) | No | Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band |
| Bluetooth | Text (Short text) | No | 5.4, A2DP, LE |
| Positioning | Text (Long text) | No | GPS, GLONASS, BDS, GALILEO, QZSS |
| NFC | Text (Short text) | No | Yes |
| Radio | Text (Short text) | No | No |
| USB | Text (Short text) | No | USB Type-C 3.2, DisplayPort 1.2, OTG |

---

## 11. Component: `specs.features`

**Category:** specs
**Display Name:** Features
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Sensors | Text (Long text) | No | Fingerprint (ultrasonic), accelerometer, gyro, proximity, compass, barometer |

---

## 12. Component: `specs.battery`

**Category:** specs
**Display Name:** Battery
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Type | Text (Short text) | No | Li-Ion 5000 mAh |
| Charging | Text (Long text) | No | 45W wired, 15W wireless (Qi2), 4.5W reverse wireless |

---

## 13. Component: `specs.misc`

**Category:** specs
**Display Name:** Misc
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Colors | Text (Long text) | No | Titanium Silver Blue, Titanium Black, ... |
| Models | Text (Long text) | No | SM-S938B, SM-S938U, SM-S938N, ... |
| SAR | Text (Short text) | No | 1.26 W/kg (head), 0.64 W/kg (body) |
| SAREU | Text (Short text) | No | 1.25 W/kg (head), 1.42 W/kg (body) |
| Price | Text (Short text) | No | $ 749.00 / € 890.00 / £ 764.00 |

---

## 14. Component: `specs.tests`

**Category:** specs
**Display Name:** Tests (GSMArena)
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Performance | Text (Long text) | No | AnTuTu: 2207809, GeekBench: 9846, 3DMark: 6687 |
| Display | Text (Short text) | No | 1417 nits max brightness |
| Loudspeaker | Text (Short text) | No | -24.6 LUFS (Very good) |
| Battery | Text (Short text) | No | Active use score 14:49h |

---

## 15. Component: `specs.eu-label`

**Category:** specs
**Display Name:** EU Label
**Fields:**

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Energy | Text (Short text) | No | Class B |
| Battery | Text (Short text) | No | 44:54h endurance, 2000 cycles |
| FreeFall | Text (Short text) | No | Class A (270 falls) |
| Repairability | Text (Short text) | No | Class C |

---

## Cách sử dụng trong Item Content Type

Sau khi tạo xong 15 components trên, thêm vào **Item** content type:

1. Mở Item schema
2. Thêm field mới: **PhoneSpecs** (type: Component)
3. Chọn "Repeatable component"
4. Select components từ category "specs":
   - specs.network
   - specs.launch
   - specs.body
   - specs.display
   - specs.platform
   - specs.memory
   - specs.main-camera
   - specs.selfie-camera
   - specs.sound
   - specs.comms
   - specs.features
   - specs.battery
   - specs.misc
   - specs.tests
   - specs.eu-label

Hoặc dùng **Dynamic Zone** để flexible hơn (recommended).

---

## Notes

- Tất cả fields là **optional** (không required) vì không phải phone nào cũng có đủ mọi thông tin
- Field names không dấu, PascalCase hoặc camelCase
- Field "2Gbands" viết là "Bands2G" để tránh bắt đầu bằng số
- Main camera field "Modules" thay vì "Quad"/"Triple" để flexible
- Tests & EU Label là optional data từ GSMArena, không phải phone nào cũng có
