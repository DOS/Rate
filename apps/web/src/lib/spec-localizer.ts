import { type RateLocale, normalizeRateLocale } from './rate-i18n';

export interface SpecUiDictionary {
  sectionEyebrow: string;
  sectionTitle: string;
  sectionBadge: string;
  yes: string;
  no: string;
  supported: string;
  availableStatus: string;
  has5gYes: string;
  groups: {
    display: string;
    hardware: string;
    camera: string;
    battery: string;
    design: string;
    cellular: string;
    connectivity: string;
    multimedia: string;
    availability: string;
    regulatory: string;
  };
  fields: {
    screenSize: string;
    panelType: string;
    resolution: string;
    refreshRate: string;
    ppi: string;
    protection: string;
    displayFeatures: string;
    chipset: string;
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
    storageExpansion: string;
    os: string;
    rearSetup: string;
    mainCamera: string;
    secondCamera: string;
    thirdCamera: string;
    fourthCamera: string;
    frontCamera: string;
    videoAndFlash: string;
    batteryCapacity: string;
    batteryType: string;
    chargingTech: string;
    fastCharging: string;
    reverseCharging: string;
    dimensions: string;
    weight: string;
    materialsAndBuild: string;
    resistance: string;
    biometrics: string;
    physicalKeys: string;
    support5g: string;
    networkTech: string;
    simType: string;
    dataSpeed: string;
    bands5g4g: string;
    volteVowifi: string;
    wlan: string;
    bluetooth: string;
    usbPort: string;
    nfc: string;
    locationGps: string;
    sensorsAndOther: string;
    loudspeaker: string;
    jack35mm: string;
    audioFeatures: string;
    announcedDate: string;
    commercialStatus: string;
    msrpPrice: string;
    certifications: string;
    fccApproval: string;
    sarLevel: string;
    sarHeadPrefix: string;
    sarBodyPrefix: string;
  };
}

const SPEC_UI_DICTS: Record<RateLocale, SpecUiDictionary> = {
  vi: {
    sectionEyebrow: 'Phân nhóm theo GSMArena / PhoneArena',
    sectionTitle: 'Thông số kỹ thuật chi tiết',
    sectionBadge: '10 nhóm thông số',
    yes: 'Có',
    no: 'Không',
    supported: 'Có hỗ trợ',
    availableStatus: 'Đang kinh doanh',
    has5gYes: 'Có (5G Sub-6 / mmWave)',
    groups: {
      display: '1. Màn hình (Display)',
      hardware: '2. Phần cứng & Hiệu năng (Hardware)',
      camera: '3. Máy ảnh & Quang học (Camera - PhoneArena Split)',
      battery: '4. Pin & Công nghệ Sạc (Battery)',
      design: '5. Thiết kế & Độ bền (Design)',
      cellular: '6. Mạng Di động & 5G (Cellular)',
      connectivity: '7. Kết nối & Cảm biến (Connectivity)',
      multimedia: '8. Âm thanh & Đa phương tiện (Multimedia)',
      availability: '9. Phát hành & Giá niêm yết (Availability)',
      regulatory: '10. Pháp lý, Chứng nhận & SAR (Regulatory)',
    },
    fields: {
      screenSize: 'Kích thước màn hình',
      panelType: 'Công nghệ tấm nền',
      resolution: 'Độ phân giải',
      refreshRate: 'Tần số quét',
      ppi: 'Mật độ điểm ảnh',
      protection: 'Kính bảo vệ',
      displayFeatures: 'Tính năng hiển thị',
      chipset: 'Vi xử lý (Chipset)',
      cpu: 'Nhân CPU',
      gpu: 'Đồ họa (GPU)',
      ram: 'Bộ nhớ RAM',
      storage: 'Bộ nhớ trong (ROM)',
      storageExpansion: 'Mở rộng lưu trữ',
      os: 'Hệ điều hành',
      rearSetup: 'Cấu hình cụm sau',
      mainCamera: 'Camera chính (Góc rộng)',
      secondCamera: 'Camera phụ 2 (Góc siêu rộng)',
      thirdCamera: 'Camera phụ 3 (Tele / Zoom)',
      fourthCamera: 'Camera phụ 4 (Tiềm vọng / Cảm biến)',
      frontCamera: 'Camera trước (Selfie)',
      videoAndFlash: 'Quay video & Đèn Flash',
      batteryCapacity: 'Dung lượng pin',
      batteryType: 'Loại pin',
      chargingTech: 'Công nghệ sạc',
      fastCharging: 'Công suất sạc nhanh',
      reverseCharging: 'Sạc ngược',
      dimensions: 'Kích thước thân máy',
      weight: 'Trọng lượng',
      materialsAndBuild: 'Chất liệu & Khung viền',
      resistance: 'Kháng nước & bụi',
      biometrics: 'Bảo mật sinh trắc học',
      physicalKeys: 'Phím vật lý',
      support5g: 'Hỗ trợ 5G',
      networkTech: 'Công nghệ mạng',
      simType: 'Chuẩn SIM',
      dataSpeed: 'Tốc độ dữ liệu',
      bands5g4g: 'Băng tần 5G / 4G',
      volteVowifi: 'VoLTE / VoWiFi',
      wlan: 'Wi-Fi (WLAN)',
      bluetooth: 'Bluetooth',
      usbPort: 'Cổng giao tiếp',
      nfc: 'Kết nối NFC',
      locationGps: 'Định vị vệ tinh (GPS)',
      sensorsAndOther: 'Cảm biến & Kết nối khác',
      loudspeaker: 'Hệ thống loa',
      jack35mm: 'Jack tai nghe 3.5mm',
      audioFeatures: 'Công nghệ âm thanh',
      announcedDate: 'Thời điểm ra mắt',
      commercialStatus: 'Trạng thái thương mại',
      msrpPrice: 'Giá khởi điểm (MSRP)',
      certifications: 'Chứng nhận chất lượng',
      fccApproval: 'Phê duyệt FCC / CE',
      sarLevel: 'Mức bức xạ an toàn (SAR)',
      sarHeadPrefix: 'Đầu',
      sarBodyPrefix: 'Thân',
    },
  },
  en: {
    sectionEyebrow: 'Grouped like GSMArena / PhoneArena',
    sectionTitle: 'Full specifications',
    sectionBadge: '10 spec groups',
    yes: 'Yes',
    no: 'No',
    supported: 'Supported',
    availableStatus: 'Available',
    has5gYes: 'Yes (5G Sub-6 / mmWave)',
    groups: {
      display: '1. Display & panel',
      hardware: '2. Hardware & performance',
      camera: '3. Camera system (PhoneArena Split)',
      battery: '4. Battery & charging',
      design: '5. Design & durability',
      cellular: '6. Cellular & 5G network',
      connectivity: '7. Connectivity & sensors',
      multimedia: '8. Audio & multimedia',
      availability: '9. Availability & MSRP',
      regulatory: '10. Regulatory, certifications & SAR',
    },
    fields: {
      screenSize: 'Screen size',
      panelType: 'Panel technology',
      resolution: 'Resolution',
      refreshRate: 'Refresh rate',
      ppi: 'Pixel density',
      protection: 'Protection glass',
      displayFeatures: 'Display features',
      chipset: 'Chipset (SoC)',
      cpu: 'CPU architecture',
      gpu: 'Graphics (GPU)',
      ram: 'Memory (RAM)',
      storage: 'Internal storage',
      storageExpansion: 'Storage expansion',
      os: 'Operating system',
      rearSetup: 'Rear camera setup',
      mainCamera: 'Main camera (wide)',
      secondCamera: 'Second camera (ultrawide)',
      thirdCamera: 'Third camera (telephoto)',
      fourthCamera: 'Fourth camera (periscope / ToF)',
      frontCamera: 'Front camera (selfie)',
      videoAndFlash: 'Video recording & flash',
      batteryCapacity: 'Battery capacity',
      batteryType: 'Battery type',
      chargingTech: 'Charging technology',
      fastCharging: 'Fast charging power',
      reverseCharging: 'Reverse charging',
      dimensions: 'Dimensions',
      weight: 'Weight',
      materialsAndBuild: 'Materials & frame',
      resistance: 'Water & dust resistance',
      biometrics: 'Biometric security',
      physicalKeys: 'Physical controls',
      support5g: '5G support',
      networkTech: 'Network technology',
      simType: 'SIM configuration',
      dataSpeed: 'Data speed',
      bands5g4g: '5G / 4G bands',
      volteVowifi: 'VoLTE / VoWiFi',
      wlan: 'Wi-Fi (WLAN)',
      bluetooth: 'Bluetooth',
      usbPort: 'USB / I/O port',
      nfc: 'NFC support',
      locationGps: 'Positioning (GPS)',
      sensorsAndOther: 'Sensors & extras',
      loudspeaker: 'Loudspeaker system',
      jack35mm: '3.5mm headphone jack',
      audioFeatures: 'Audio technologies',
      announcedDate: 'Announced date',
      commercialStatus: 'Market status',
      msrpPrice: 'Launch MSRP',
      certifications: 'Quality certifications',
      fccApproval: 'FCC / CE approval',
      sarLevel: 'SAR radiation rating',
      sarHeadPrefix: 'Head',
      sarBodyPrefix: 'Body',
    },
  },
  cs: {
    sectionEyebrow: 'Členění podle GSMArena / PhoneArena',
    sectionTitle: 'Podrobné technické parametry',
    sectionBadge: '10 skupin parametrů',
    yes: 'Ano',
    no: 'Ne',
    supported: 'Podporováno',
    availableStatus: 'V prodeji',
    has5gYes: 'Ano (5G Sub-6 / mmWave)',
    groups: {
      display: '1. Displej a obrazovka',
      hardware: '2. Hardware a výkon',
      camera: '3. Fotoaparát a optika (PhoneArena Split)',
      battery: '4. Baterie a nabíjení',
      design: '5. Konstrukce a odolnost',
      cellular: '6. Mobilní sítě a 5G',
      connectivity: '7. Konektivita a senzory',
      multimedia: '8. Zvuk a multimédia',
      availability: '9. Dostupnost a cena (MSRP)',
      regulatory: '10. Certifikace a hodnota SAR',
    },
    fields: {
      screenSize: 'Úhlopříčka displeje',
      panelType: 'Typ panelu',
      resolution: 'Rozlišení',
      refreshRate: 'Obnovovací frekvence',
      ppi: 'Jemnost displeje',
      protection: 'Ochranné sklo',
      displayFeatures: 'Funkce displeje',
      chipset: 'Čipset (SoC)',
      cpu: 'Procesor (CPU)',
      gpu: 'Grafický čip (GPU)',
      ram: 'Operační paměť (RAM)',
      storage: 'Interní úložiště',
      storageExpansion: 'Rozšíření paměti',
      os: 'Operační systém',
      rearSetup: 'Sestava zadního fotoaparátu',
      mainCamera: 'Hlavní snímač (Wide)',
      secondCamera: 'Druhý snímač (Ultrawide)',
      thirdCamera: 'Třetí snímač (Teleobjektiv)',
      fourthCamera: 'Čtvrtý snímač (Periskop / ToF)',
      frontCamera: 'Přední kamera (Selfie)',
      videoAndFlash: 'Záznam videa a blesk',
      batteryCapacity: 'Kapacita baterie',
      batteryType: 'Typ baterie',
      chargingTech: 'Technologie nabíjení',
      fastCharging: 'Výkon rychlého nabíjení',
      reverseCharging: 'Reverzní nabíjení',
      dimensions: 'Rozměry',
      weight: 'Hmotnost',
      materialsAndBuild: 'Materiály a rám',
      resistance: 'Odolnost proti vodě a prachu',
      biometrics: 'Biometrické zabezpečení',
      physicalKeys: 'Fyzická tlačítka',
      support5g: 'Podpora 5G',
      networkTech: 'Síťová technologie',
      simType: 'Typ SIM karty',
      dataSpeed: 'Rychlost dat',
      bands5g4g: 'Pásma 5G / 4G',
      volteVowifi: 'VoLTE / VoWiFi',
      wlan: 'Wi-Fi (WLAN)',
      bluetooth: 'Bluetooth',
      usbPort: 'Konektor USB',
      nfc: 'NFC',
      locationGps: 'Navigace (GPS)',
      sensorsAndOther: 'Senzory a další',
      loudspeaker: 'Reproduktory',
      jack35mm: '3.5mm audio konektor',
      audioFeatures: 'Zvukové technologie',
      announcedDate: 'Datum představení',
      commercialStatus: 'Stav prodeje',
      msrpPrice: 'Doporučená cena (MSRP)',
      certifications: 'Certifikace kvality',
      fccApproval: 'Schválení FCC / CE',
      sarLevel: 'Hodnota vyzařování SAR',
      sarHeadPrefix: 'Hlava',
      sarBodyPrefix: 'Tělo',
    },
  },
};

export function getSpecUiDictionary(locale?: string): SpecUiDictionary {
  return SPEC_UI_DICTS[normalizeRateLocale(locale)];
}

const MONTH_VI_MAP: Record<string, string> = {
  january: 'Tháng 01',
  february: 'Tháng 02',
  march: 'Tháng 03',
  april: 'Tháng 04',
  may: 'Tháng 05',
  june: 'Tháng 06',
  july: 'Tháng 07',
  august: 'Tháng 08',
  september: 'Tháng 09',
  october: 'Tháng 10',
  november: 'Tháng 11',
  december: 'Tháng 12',
};

const MONTH_CS_MAP: Record<string, string> = {
  january: 'Leden',
  february: 'Únor',
  march: 'Březen',
  april: 'Duben',
  may: 'Květen',
  june: 'Červen',
  july: 'Červenec',
  august: 'Srpen',
  september: 'Září',
  october: 'Říjen',
  november: 'Listopad',
  december: 'Prosinec',
};

const VI_SPEC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bQuad Camera\b/gi, 'Cụm 4 camera'],
  [/\bTriple Camera\b/gi, 'Cụm 3 camera'],
  [/\bDual Camera\b/gi, 'Cụm camera kép'],
  [/\bSingle Camera\b/gi, 'Camera đơn'],
  [/\bAvailable\.\s*Released\s+/gi, 'Đang kinh doanh - Phát hành '],
  [/\bAvailable\b/gi, 'Đang kinh doanh'],
  [/\bNo card slot\b/gi, 'Không hỗ trợ khe thẻ nhớ'],
  [/\bnon-removable\b/gi, 'liền máy'],
  [/\bdust\/water resistant\b/gi, 'kháng bụi và nước'],
  [/\bwater resistant\b/gi, 'kháng nước'],
  [
    /\bup to (\d+(?:\.\d+)?m) for (\d+) min\b/gi,
    'ở độ sâu tới $1 trong $2 phút',
  ],
  [/\bGlass front\b/gi, 'Mặt trước kính'],
  [/\bglass back\b/gi, 'mặt lưng kính'],
  [/\btitanium frame\s*\(grade\s*(\d+)\)/gi, 'khung Titan cấp độ $1'],
  [/\btitanium frame\b/gi, 'khung Titan'],
  [/\baerospace-grade aluminum frame\b/gi, 'khung nhôm hàng không vũ trụ'],
  [/\baluminum frame\b/gi, 'khung nhôm'],
  [/\bstainless steel frame\b/gi, 'khung thép không gỉ'],
  [/\bcolor-infused glass back\b/gi, 'mặt lưng kính pha màu'],
  [/\bunder display,\s*ultrasonic\b/gi, 'dưới màn hình (siêu âm)'],
  [/\bunder display,\s*optical\b/gi, 'dưới màn hình (quang học)'],
  [/\bFingerprint\b/gi, 'Vân tay'],
  [/\baccelerometer\b/gi, 'gia tốc kế'],
  [/\bgyro\b/gi, 'con quay hồi chuyển'],
  [/\bproximity\b/gi, 'tiệm cận'],
  [/\bcompass\b/gi, 'la bàn'],
  [/\bbarometer\b/gi, 'áp kế'],
  [/\bStereo speakers\b/gi, 'Hệ thống loa kép Stereo'],
  [/\bwith stereo speakers\b/gi, 'loa kép Stereo'],
  [/\(wide\)/gi, '(góc rộng)'],
  [/\(ultrawide\)/gi, '(góc siêu rộng)'],
  [/\(periscope telephoto\)/gi, '(tiềm vọng tele)'],
  [/\(periscope tetraprism telephoto\)/gi, '(tiềm vọng tứ lăng kính tele)'],
  [/\(telephoto\)/gi, '(tele)'],
  [/\(variable aperture\)/gi, '(khẩu độ biến thiên)'],
  [/\bmulti-directional PDAF\b/gi, 'lấy nét đa hướng PDAF'],
  [/\bdual pixel PDAF\b/gi, 'lấy nét Dual Pixel PDAF'],
  [/\bsensor-shift OIS\b/gi, 'chống rung dịch chuyển cảm biến OIS'],
  [/\bOIS\b/g, 'chống rung quang học OIS'],
  [/(\d+(?:\.\d+)?x)\s+optical zoom\b/gi, 'zoom quang $1'],
  [/\boptical zoom\b/gi, 'zoom quang học'],
  [/\bDual-LED dual-tone flash\b/gi, 'Đèn flash LED kép 2 tông màu'],
  [/\bLED flash\b/gi, 'Đèn flash LED'],
  [/\breverse wireless\b/gi, 'sạc ngược không dây'],
  [/\breverse wired\b/gi, 'sạc ngược có dây'],
  [/\bwireless\b/gi, 'không dây'],
  [/\bwired\b/gi, 'có dây'],
  [/\b(\d+)%\s+in\s+(\d+)\s+min\b/gi, '$1% trong $2 phút'],
  [/\(typ\)/gi, '(tiêu chuẩn)'],
  [/\(peak\)/gi, '(đỉnh)'],
  [/\(HBM\)/gi, '(HBM)'],
  [/\bratio\b/gi, 'tỷ lệ'],
  [/\bOcta-core\b/gi, '8 nhân (Octa-core)'],
  [/\bHexa-core\b/gi, '6 nhân (Hexa-core)'],
  [/\bDeca-core\b/gi, '10 nhân (Deca-core)'],
];

const EN_SPEC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Không hỗ trợ thẻ nhớ/gi, 'No card slot'],
  [/Không hỗ trợ/gi, 'Not supported'],
  [/Đang kinh doanh/gi, 'Available'],
  [/Có hỗ trợ/gi, 'Supported'],
  [
    /Khung nhôm hàng không, mặt lưng kính pha màu nhám/gi,
    'Aerospace aluminum frame, matte color-infused glass back',
  ],
  [/Khung Titan cấp độ 5/gi, 'Grade 5 Titanium frame'],
  [/kháng nước và bụi\s+(IP\d+[A-Z]?)/gi, '$1 dust/water resistant'],
  [
    /ngâm nước sâu (\d+(?:\.\d+)?m) trong (\d+) phút/gi,
    'immersible up to $1 for $2 min',
  ],
  [/Cụm 4 camera/gi, 'Quad Camera'],
  [/Cụm 3 camera/gi, 'Triple Camera'],
  [/Cụm camera kép/gi, 'Dual Camera'],
  [/Camera đơn/gi, 'Single Camera'],
];

const CS_SPEC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bQuad Camera\b|Cụm 4 camera/gi, 'Čtyřnásobný fotoaparát'],
  [/\bTriple Camera\b|Cụm 3 camera/gi, 'Trojitý fotoaparát'],
  [/\bDual Camera\b|Cụm camera kép/gi, 'Duální fotoaparát'],
  [/\bSingle Camera\b|Camera đơn/gi, 'Jediný fotoaparát'],
  [/\bAvailable\b|Đang kinh doanh/gi, 'V prodeji'],
  [/\bNo card slot\b|Không hỗ trợ thẻ nhớ/gi, 'Bez slotu na paměťovou kartu'],
  [/\bnon-removable\b/gi, 'nevyměnitelná'],
  [/\bdust\/water resistant\b/gi, 'odolnost proti prachu a vodě'],
  [
    /\bup to (\d+(?:\.\d+)?m) for (\d+) min\b/gi,
    'do hloubky $1 po dobu $2 min',
  ],
  [/\bStereo speakers\b/gi, 'Stereo reproduktory'],
  [/\btitanium frame\b/gi, 'titanový rám'],
  [/\baluminum frame\b/gi, 'hliníkový rám'],
  [/\(wide\)/gi, '(širokoúhlý)'],
  [/\(ultrawide\)/gi, '(ultraširokoúhlý)'],
  [/\(periscope telephoto\)/gi, '(periskopický teleobjektiv)'],
  [/\(telephoto\)/gi, '(teleobjektiv)'],
  [/\boptical zoom\b/gi, 'optický zoom'],
];

/**
 * Localizes a raw technical specification string (originally sourced from PhoneArena/GSMArena)
 * into the active locale (`vi`, `en`, or `cs`) while preserving technical units and standards.
 */
export function localizeSpecValue(
  raw: string | number | boolean | null | undefined,
  locale?: string
): string {
  if (raw === null || raw === undefined) return '-';
  const lang = normalizeRateLocale(locale);
  const dict = SPEC_UI_DICTS[lang];

  if (typeof raw === 'boolean') {
    return raw ? dict.yes : dict.no;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : '-';
  }

  let text = String(raw)
    .replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, 2_000);
  if (!text || text === '-') return '-';

  if (lang === 'vi') {
    text = text.replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
      (_, m: string, y: string) => {
        const mapped = MONTH_VI_MAP[m.toLowerCase()];
        return mapped ? `${mapped}/${y}` : `${m} ${y}`;
      }
    );
    for (const [pattern, replacement] of VI_SPEC_REPLACEMENTS) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  if (lang === 'en') {
    for (const [pattern, replacement] of EN_SPEC_REPLACEMENTS) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  // Czech ('cs')
  text = text.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    (_, m: string, y: string) => {
      const mapped = MONTH_CS_MAP[m.toLowerCase()];
      return mapped ? `${mapped} ${y}` : `${m} ${y}`;
    }
  );
  for (const [pattern, replacement] of EN_SPEC_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of CS_SPEC_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}
