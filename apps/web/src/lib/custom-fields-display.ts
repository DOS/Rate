import {
  sanitizeCustomFields,
  type CustomFields,
  type CustomFieldValue,
} from '@repo/shared-data/rules';
import { isVietnamese } from './content-lang';
import { NBSP } from './locale-format';
import { type RateLocale, normalizeRateLocale } from './rate-i18n';

export interface CustomFieldDisplayRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Language tag when an untranslated raw string differs from the active page locale. */
  readonly lang?: 'en' | 'vi';
  /** Parsed numeric value for compare winner highlighting when the field is comparable. */
  readonly numericValue?: number;
  /** Direction for compare winner highlighting (`true` = higher wins, `false` = lower wins). */
  readonly higherIsBetter?: boolean;
}

export type CustomFieldExportRow = [string, string, string];

type LocalizedText = Readonly<Record<RateLocale, string>>;

interface CustomFieldMeta {
  readonly labels: LocalizedText;
  readonly kind?:
    | 'text'
    | 'number'
    | 'vnd'
    | 'percent'
    | 'percent_yearly'
    | 'boolean'
    | 'enum'
    | 'list'
    | 'country'
    | 'energy_rating'
    | 'age_months'
    | 'months';
  readonly unit?: string | LocalizedText;
  readonly boolLabels?: Readonly<{
    true: LocalizedText;
    false: LocalizedText;
  }>;
  readonly enumMap?: Readonly<Record<string, LocalizedText>>;
  readonly higherIsBetter?: boolean;
}

const YES_NO_LABELS: Readonly<{ true: LocalizedText; false: LocalizedText }> = {
  true: { vi: 'Có', en: 'Yes', cs: 'Ano' },
  false: { vi: 'Không', en: 'No', cs: 'Ne' },
};

const TWO_WAY_LABELS: Readonly<{ true: LocalizedText; false: LocalizedText }> =
  {
    true: {
      vi: '2 chiều (làm lạnh & sưởi)',
      en: '2-way (cooling & heating)',
      cs: 'Dvoucestná',
    },
    false: {
      vi: '1 chiều (chỉ làm lạnh)',
      en: '1-way (cooling only)',
      cs: 'Jednocestná',
    },
  };

const CURVED_LABELS: Readonly<{ true: LocalizedText; false: LocalizedText }> = {
  true: { vi: 'Màn hình cong', en: 'Curved', cs: 'Zakřivený' },
  false: { vi: 'Màn hình phẳng', en: 'Flat', cs: 'Plochý' },
};

const DOOR_STYLE_ENUM: Readonly<Record<string, LocalizedText>> = {
  side_by_side: {
    vi: 'Side by Side',
    en: 'Side-by-side',
    cs: 'Americká (Side-by-Side)',
  },
  french_door: {
    vi: 'French Door',
    en: 'French door',
    cs: 'French Door',
  },
  french: {
    vi: 'French Door',
    en: 'French door',
    cs: 'French Door',
  },
  multidoor: {
    vi: 'Nhiều cửa (Multidoor)',
    en: 'Multi-door',
    cs: 'Vícedveřová',
  },
  multi_door: {
    vi: 'Nhiều cửa (Multidoor)',
    en: 'Multi-door',
    cs: 'Vícedveřová',
  },
  ngan_da_duoi: {
    vi: 'Ngăn đá dưới',
    en: 'Bottom freezer',
    cs: 'Mrazák dole',
  },
  ngan_da_tren: {
    vi: 'Ngăn đá trên',
    en: 'Top freezer',
    cs: 'Mrazák nahoře',
  },
  mini: {
    vi: 'Tủ lạnh mini',
    en: 'Mini fridge',
    cs: 'Minilednice',
  },
};

const DRUM_TYPE_ENUM: Readonly<Record<string, LocalizedText>> = {
  front_load: {
    vi: 'Cửa trước (lồng ngang)',
    en: 'Front-load',
    cs: 'Přední plnění',
  },
  top_load: {
    vi: 'Cửa trên (lồng đứng)',
    en: 'Top-load',
    cs: 'Horní plnění',
  },
};

const ACCOUNT_TYPE_ENUM: Readonly<Record<string, LocalizedText>> = {
  online: {
    vi: 'Gửi trực tuyến',
    en: 'Online',
    cs: 'Online',
  },
  counter: {
    vi: 'Tại quầy',
    en: 'Over-the-counter',
    cs: 'Na pobočce',
  },
};

const PACKAGE_KIND_ENUM: Readonly<Record<string, LocalizedText>> = {
  fiber: {
    vi: 'Cáp quang',
    en: 'Fiber broadband',
    cs: 'Optický internet',
  },
  mobile_data: {
    vi: 'Data di động',
    en: 'Mobile data',
    cs: 'Mobilní data',
  },
  combo: {
    vi: 'Combo Internet & Truyền hình',
    en: 'Internet & TV combo',
    cs: 'Balíček internet a TV',
  },
};

const BILLING_CYCLE_ENUM: Readonly<Record<string, LocalizedText>> = {
  monthly: {
    vi: 'Hàng tháng',
    en: 'Monthly',
    cs: 'Měsíčně',
  },
  quarterly: {
    vi: 'Hàng quý',
    en: 'Quarterly',
    cs: 'Čtvrtletně',
  },
  semiannual: {
    vi: '6 tháng',
    en: 'Semi-annual',
    cs: 'Pololetně',
  },
  semi_annual: {
    vi: '6 tháng',
    en: 'Semi-annual',
    cs: 'Pololetně',
  },
  annual: {
    vi: 'Hàng năm',
    en: 'Annual',
    cs: 'Ročně',
  },
  yearly: {
    vi: 'Hàng năm',
    en: 'Yearly',
    cs: 'Ročně',
  },
};

const PRODUCT_FORM_ENUM: Readonly<Record<string, LocalizedText>> = {
  sunscreen: {
    vi: 'Kem chống nắng',
    en: 'Sunscreen',
    cs: 'Opalovací krém',
  },
  micellar_water: {
    vi: 'Nước tẩy trang',
    en: 'Micellar water',
    cs: 'Micelární voda',
  },
  cleanser: {
    vi: 'Sữa rửa mặt',
    en: 'Cleanser',
    cs: 'Čisticí přípravek',
  },
  serum: {
    vi: 'Tinh chất (Serum)',
    en: 'Serum',
    cs: 'Sérum',
  },
  mask: {
    vi: 'Mặt nạ',
    en: 'Mask',
    cs: 'Pleťová maska',
  },
  toner: {
    vi: 'Nước cân bằng (Toner)',
    en: 'Toner',
    cs: 'Tonikum',
  },
  lotion: {
    vi: 'Sữa dưỡng (Lotion)',
    en: 'Lotion',
    cs: 'Pleťové mléko',
  },
  scrub: {
    vi: 'Tẩy tế bào chết',
    en: 'Exfoliating scrub',
    cs: 'Peeling',
  },
  balm: {
    vi: 'Sáp dưỡng',
    en: 'Balm',
    cs: 'Balzám',
  },
  gel: {
    vi: 'Gel dưỡng',
    en: 'Gel',
    cs: 'Gel',
  },
  cream: {
    vi: 'Kem dưỡng',
    en: 'Cream',
    cs: 'Krém',
  },
  wash: {
    vi: 'Gel rửa mặt / Sữa tắm',
    en: 'Wash',
    cs: 'Mycí gel',
  },
};

const SKIN_TYPE_ENUM: Readonly<Record<string, LocalizedText>> = {
  da_dau_mun: {
    vi: 'Da dầu mụn',
    en: 'Oily & acne-prone skin',
    cs: 'Mastná a aknózní pleť',
  },
  oily_acne: {
    vi: 'Da dầu mụn',
    en: 'Oily & acne-prone skin',
    cs: 'Mastná a aknózní pleť',
  },
  da_nhay_cam: {
    vi: 'Da nhạy cảm',
    en: 'Sensitive skin',
    cs: 'Citlivá pleť',
  },
  sensitive: {
    vi: 'Da nhạy cảm',
    en: 'Sensitive skin',
    cs: 'Citlivá pleť',
  },
  da_kho: {
    vi: 'Da khô',
    en: 'Dry skin',
    cs: 'Suchá pleť',
  },
  dry: {
    vi: 'Da khô',
    en: 'Dry skin',
    cs: 'Suchá pleť',
  },
  da_hon_hop: {
    vi: 'Da hỗn hợp',
    en: 'Combination skin',
    cs: 'Smíšená pleť',
  },
  combination: {
    vi: 'Da hỗn hợp',
    en: 'Combination skin',
    cs: 'Smíšená pleť',
  },
  moi_loai_da: {
    vi: 'Mọi loại da',
    en: 'All skin types',
    cs: 'Všechny typy pleti',
  },
  all_skin_types: {
    vi: 'Mọi loại da',
    en: 'All skin types',
    cs: 'Všechny typy pleti',
  },
  da_dau: {
    vi: 'Da dầu',
    en: 'Oily skin',
    cs: 'Mastná pleť',
  },
  da_thuong: {
    vi: 'Da thường',
    en: 'Normal skin',
    cs: 'Normální pleť',
  },
};

const MOTHER_BABY_PRODUCT_TYPE_ENUM: Readonly<Record<string, LocalizedText>> = {
  formula_milk: {
    vi: 'Sữa bột công thức',
    en: 'Infant formula',
    cs: 'Kojenecká výživa',
  },
  liquid_milk: {
    vi: 'Sữa pha sẵn',
    en: 'Ready-to-feed milk',
    cs: 'Tekuté kojenecké mléko',
  },
  diaper: {
    vi: 'Tã bỉm',
    en: 'Diaper',
    cs: 'Plenky',
  },
  feeding_bottle: {
    vi: 'Bình sữa',
    en: 'Feeding bottle',
    cs: 'Kojenecká láhev',
  },
  pacifier_teat: {
    vi: 'Ti giả & Núm ti',
    en: 'Pacifier & teat',
    cs: 'Dudlík a savička',
  },
  baby_food: {
    vi: 'Thực phẩm ăn dặm',
    en: 'Baby food',
    cs: 'Dětská výživa',
  },
};

const DOSAGE_FORM_ENUM: Readonly<Record<string, LocalizedText>> = {
  effervescent: {
    vi: 'Viên sủi',
    en: 'Effervescent tablet',
    cs: 'Šumivá tableta',
  },
  softgel: {
    vi: 'Viên nang mềm',
    en: 'Softgel',
    cs: 'Měkká tobolka',
  },
  capsule: {
    vi: 'Viên nang',
    en: 'Capsule',
    cs: 'Kapsle',
  },
  tablet: {
    vi: 'Viên nén',
    en: 'Tablet',
    cs: 'Tableta',
  },
  liquid: {
    vi: 'Dạng lỏng / Siro',
    en: 'Liquid',
    cs: 'Tekutá forma',
  },
  gummy: {
    vi: 'Kẹo dẻo',
    en: 'Gummy',
    cs: 'Žvýkací bonbóny',
  },
  powder: {
    vi: 'Dạng bột',
    en: 'Powder',
    cs: 'Prášek',
  },
  drops: {
    vi: 'Dạng nhỏ giọt',
    en: 'Drops',
    cs: 'Kapky',
  },
  spray: {
    vi: 'Dạng xịt',
    en: 'Spray',
    cs: 'Sprej',
  },
};

const TARGET_BENEFIT_ENUM: Readonly<Record<string, LocalizedText>> = {
  bone_joint: {
    vi: 'Xương khớp',
    en: 'Bone & joint health',
    cs: 'Kosti a klouby',
  },
  energy_vitality: {
    vi: 'Năng lượng & Sức bền',
    en: 'Energy & vitality',
    cs: 'Energie a vitalita',
  },
  immunity: {
    vi: 'Tăng đề kháng',
    en: 'Immune support',
    cs: 'Imunita',
  },
  digestive_gut: {
    vi: 'Tiêu hóa & Đường ruột',
    en: 'Digestive & gut health',
    cs: 'Trávení a střevní mikroflóra',
  },
  brain_sleep: {
    vi: 'Trí não & Giấc ngủ',
    en: 'Brain & sleep support',
    cs: 'Mozek a spánek',
  },
  heart_eye: {
    vi: 'Tim mạch & Thị lực',
    en: 'Heart & eye health',
    cs: 'Srdce a zrak',
  },
  women_hormone: {
    vi: 'Nội tiết & Sức khỏe phụ nữ',
    en: "Women's health & hormones",
    cs: 'Zdraví žen a hormony',
  },
  liver: {
    vi: 'Hỗ trợ gan',
    en: 'Liver support',
    cs: 'Podpora jater',
  },
  skin_beauty: {
    vi: 'Làm đẹp da, tóc & móng',
    en: 'Skin, hair & nail beauty',
    cs: 'Krása pleti, vlasů a nehtů',
  },
};

const CAMERA_TYPE_ENUM: Readonly<Record<string, LocalizedText>> = {
  mirrorless: {
    vi: 'Máy ảnh không gương lật (Mirrorless)',
    en: 'Mirrorless',
    cs: 'Bezzrcadlovka',
  },
  dslr: {
    vi: 'Máy ảnh DSLR',
    en: 'DSLR',
    cs: 'Zrcadlovka (DSLR)',
  },
  action_cam: {
    vi: 'Camera hành động',
    en: 'Action camera',
    cs: 'Akční kamera',
  },
  action_camera: {
    vi: 'Camera hành động',
    en: 'Action camera',
    cs: 'Akční kamera',
  },
  compact: {
    vi: 'Máy ảnh compact',
    en: 'Compact camera',
    cs: 'Kompaktní fotoaparát',
  },
  instant: {
    vi: 'Máy ảnh chụp lấy liền',
    en: 'Instant camera',
    cs: 'Instantní fotoaparát',
  },
  vlog: {
    vi: 'Máy ảnh quay vlog',
    en: 'Vlogging camera',
    cs: 'Vlogovací kamera',
  },
  vlog_camera: {
    vi: 'Máy quay vlog',
    en: 'Vlog camera',
    cs: 'Vlogovací kamera',
  },
  '360_camera': {
    vi: 'Camera 360',
    en: '360 camera',
    cs: '360° kamera',
  },
  cinema: {
    vi: 'Máy quay điện ảnh',
    en: 'Cinema camera',
    cs: 'Filmová kamera',
  },
  medium_format: {
    vi: 'Máy ảnh Medium Format',
    en: 'Medium format',
    cs: 'Středoformátový fotoaparát',
  },
};

const SENSOR_FORMAT_ENUM: Readonly<Record<string, LocalizedText>> = {
  full_frame: { vi: 'Full-Frame', en: 'Full-Frame', cs: 'Full-Frame' },
  aps_c: { vi: 'APS-C', en: 'APS-C', cs: 'APS-C' },
  micro_four_thirds: {
    vi: 'Micro Four Thirds',
    en: 'Micro Four Thirds',
    cs: 'Micro Four Thirds',
  },
  mft: {
    vi: 'Micro Four Thirds',
    en: 'Micro Four Thirds',
    cs: 'Micro Four Thirds',
  },
  medium_format: {
    vi: 'Medium Format',
    en: 'Medium Format',
    cs: 'Střední formát',
  },
  '1_inch': { vi: '1 inch', en: '1 inch', cs: '1 palec' },
  '1_1_3_inch': { vi: '1/1.3-inch', en: '1/1.3-inch', cs: '1/1.3-inch' },
};

const BANDWIDTH_ENUM: Readonly<Record<string, LocalizedText>> = {
  unlimited: {
    vi: 'Không giới hạn',
    en: 'Unlimited',
    cs: 'Neomezený',
  },
  unmetered: {
    vi: 'Không giới hạn',
    en: 'Unmetered',
    cs: 'Neměřený',
  },
  khong_gioi_han: {
    vi: 'Không giới hạn',
    en: 'Unlimited',
    cs: 'Neomezený',
  },
  shared: {
    vi: 'Chia sẻ',
    en: 'Shared',
    cs: 'Sdílená',
  },
};

const ORIGIN_COUNTRY_ENUM: Readonly<Record<string, LocalizedText>> = {
  vietnam: { vi: 'Việt Nam', en: 'Vietnam', cs: 'Vietnam' },
  viet_nam: { vi: 'Việt Nam', en: 'Vietnam', cs: 'Vietnam' },
  vn: { vi: 'Việt Nam', en: 'Vietnam', cs: 'Vietnam' },
  japan: { vi: 'Nhật Bản', en: 'Japan', cs: 'Japonsko' },
  nhat_ban: { vi: 'Nhật Bản', en: 'Japan', cs: 'Japonsko' },
  nhat: { vi: 'Nhật Bản', en: 'Japan', cs: 'Japonsko' },
  jp: { vi: 'Nhật Bản', en: 'Japan', cs: 'Japonsko' },
  south_korea: { vi: 'Hàn Quốc', en: 'South Korea', cs: 'Jižní Korea' },
  korea: { vi: 'Hàn Quốc', en: 'South Korea', cs: 'Jižní Korea' },
  republic_of_korea: { vi: 'Hàn Quốc', en: 'South Korea', cs: 'Jižní Korea' },
  han_quoc: { vi: 'Hàn Quốc', en: 'South Korea', cs: 'Jižní Korea' },
  kr: { vi: 'Hàn Quốc', en: 'South Korea', cs: 'Jižní Korea' },
  france: { vi: 'Pháp', en: 'France', cs: 'Francie' },
  phap: { vi: 'Pháp', en: 'France', cs: 'Francie' },
  fr: { vi: 'Pháp', en: 'France', cs: 'Francie' },
  germany: { vi: 'Đức', en: 'Germany', cs: 'Německo' },
  duc: { vi: 'Đức', en: 'Germany', cs: 'Německo' },
  de: { vi: 'Đức', en: 'Germany', cs: 'Německo' },
  usa: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  us: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  united_states: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  united_states_of_america: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  america: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  my: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  hoa_ky: { vi: 'Mỹ', en: 'United States', cs: 'USA' },
  australia: { vi: 'Úc', en: 'Australia', cs: 'Austrálie' },
  uc: { vi: 'Úc', en: 'Australia', cs: 'Austrálie' },
  au: { vi: 'Úc', en: 'Australia', cs: 'Austrálie' },
  switzerland: { vi: 'Thụy Sĩ', en: 'Switzerland', cs: 'Švýcarsko' },
  thuy_si: { vi: 'Thụy Sĩ', en: 'Switzerland', cs: 'Švýcarsko' },
  ch: { vi: 'Thụy Sĩ', en: 'Switzerland', cs: 'Švýcarsko' },
  uk: { vi: 'Anh', en: 'United Kingdom', cs: 'Spojené království' },
  united_kingdom: {
    vi: 'Anh',
    en: 'United Kingdom',
    cs: 'Spojené království',
  },
  great_britain: {
    vi: 'Anh',
    en: 'United Kingdom',
    cs: 'Spojené království',
  },
  england: { vi: 'Anh', en: 'United Kingdom', cs: 'Spojené království' },
  anh: { vi: 'Anh', en: 'United Kingdom', cs: 'Spojené království' },
  vuong_quoc_anh: {
    vi: 'Anh',
    en: 'United Kingdom',
    cs: 'Spojené království',
  },
  gb: { vi: 'Anh', en: 'United Kingdom', cs: 'Spojené království' },
  canada: { vi: 'Canada', en: 'Canada', cs: 'Kanada' },
  ca: { vi: 'Canada', en: 'Canada', cs: 'Kanada' },
  new_zealand: { vi: 'New Zealand', en: 'New Zealand', cs: 'Nový Zéland' },
  nz: { vi: 'New Zealand', en: 'New Zealand', cs: 'Nový Zéland' },
  thailand: { vi: 'Thái Lan', en: 'Thailand', cs: 'Thajsko' },
  thai_lan: { vi: 'Thái Lan', en: 'Thailand', cs: 'Thajsko' },
  th: { vi: 'Thái Lan', en: 'Thailand', cs: 'Thajsko' },
  singapore: { vi: 'Singapore', en: 'Singapore', cs: 'Singapur' },
  sg: { vi: 'Singapore', en: 'Singapore', cs: 'Singapur' },
  netherlands: { vi: 'Hà Lan', en: 'Netherlands', cs: 'Nizozemsko' },
  holland: { vi: 'Hà Lan', en: 'Netherlands', cs: 'Nizozemsko' },
  ha_lan: { vi: 'Hà Lan', en: 'Netherlands', cs: 'Nizozemsko' },
  nl: { vi: 'Hà Lan', en: 'Netherlands', cs: 'Nizozemsko' },
  italy: { vi: 'Ý', en: 'Italy', cs: 'Itálie' },
  y: { vi: 'Ý', en: 'Italy', cs: 'Itálie' },
  it: { vi: 'Ý', en: 'Italy', cs: 'Itálie' },
  spain: { vi: 'Tây Ban Nha', en: 'Spain', cs: 'Španělsko' },
  tay_ban_nha: { vi: 'Tây Ban Nha', en: 'Spain', cs: 'Španělsko' },
  es: { vi: 'Tây Ban Nha', en: 'Spain', cs: 'Španělsko' },
  china: { vi: 'Trung Quốc', en: 'China', cs: 'Čína' },
  trung_quoc: { vi: 'Trung Quốc', en: 'China', cs: 'Čína' },
  cn: { vi: 'Trung Quốc', en: 'China', cs: 'Čína' },
  taiwan: { vi: 'Đài Loan', en: 'Taiwan', cs: 'Tchaj-wan' },
  dai_loan: { vi: 'Đài Loan', en: 'Taiwan', cs: 'Tchaj-wan' },
  tw: { vi: 'Đài Loan', en: 'Taiwan', cs: 'Tchaj-wan' },
  malaysia: { vi: 'Malaysia', en: 'Malaysia', cs: 'Malajsie' },
  ireland: { vi: 'Ireland', en: 'Ireland', cs: 'Irsko' },
  ie: { vi: 'Ireland', en: 'Ireland', cs: 'Irsko' },
  denmark: { vi: 'Đan Mạch', en: 'Denmark', cs: 'Dánsko' },
  dan_mach: { vi: 'Đan Mạch', en: 'Denmark', cs: 'Dánsko' },
  dk: { vi: 'Đan Mạch', en: 'Denmark', cs: 'Dánsko' },
  poland: { vi: 'Ba Lan', en: 'Poland', cs: 'Polsko' },
  ba_lan: { vi: 'Ba Lan', en: 'Poland', cs: 'Polsko' },
  pl: { vi: 'Ba Lan', en: 'Poland', cs: 'Polsko' },
  belgium: { vi: 'Bỉ', en: 'Belgium', cs: 'Belgie' },
  bi: { vi: 'Bỉ', en: 'Belgium', cs: 'Belgie' },
  be: { vi: 'Bỉ', en: 'Belgium', cs: 'Belgie' },
  sweden: { vi: 'Thụy Điển', en: 'Sweden', cs: 'Švédsko' },
  thuy_dien: { vi: 'Thụy Điển', en: 'Sweden', cs: 'Švédsko' },
  se: { vi: 'Thụy Điển', en: 'Sweden', cs: 'Švédsko' },
  austria: { vi: 'Áo', en: 'Austria', cs: 'Rakousko' },
  ao: { vi: 'Áo', en: 'Austria', cs: 'Rakousko' },
  at: { vi: 'Áo', en: 'Austria', cs: 'Rakousko' },
  indonesia: { vi: 'Indonesia', en: 'Indonesia', cs: 'Indonésie' },
  india: { vi: 'Ấn Độ', en: 'India', cs: 'Indie' },
  an_do: { vi: 'Ấn Độ', en: 'India', cs: 'Indie' },
  norway: { vi: 'Na Uy', en: 'Norway', cs: 'Norsko' },
  na_uy: { vi: 'Na Uy', en: 'Norway', cs: 'Norsko' },
  russia: { vi: 'Nga', en: 'Russia', cs: 'Rusko' },
  nga: { vi: 'Nga', en: 'Russia', cs: 'Rusko' },
  czech_republic: { vi: 'Cộng hòa Séc', en: 'Czechia', cs: 'Česko' },
  czechia: { vi: 'Cộng hòa Séc', en: 'Czechia', cs: 'Česko' },
  sec: { vi: 'Cộng hòa Séc', en: 'Czechia', cs: 'Česko' },
  cong_hoa_sec: { vi: 'Cộng hòa Séc', en: 'Czechia', cs: 'Česko' },
};

/** Canonical display order for each of the 14 non-place Wave E1-E6 categories. */
export const CATEGORY_CUSTOM_FIELD_ORDER: Readonly<
  Record<string, readonly string[]>
> = {
  'air-conditioners': [
    'capacity_btu',
    'hp_rating',
    'inverter',
    'two_way',
    'refrigerant_gas',
  ],
  refrigerators: ['capacity_liters', 'door_style', 'inverter', 'energy_rating'],
  'washing-machines': [
    'capacity_kg',
    'drum_type',
    'spin_rpm',
    'inverter',
    'washer_dryer',
  ],
  tvs: [
    'screen_size_inch',
    'panel_tech',
    'resolution',
    'refresh_rate_hz',
    'smart_os',
  ],
  'air-purifiers': [
    'cadr_m3h',
    'room_area_m2',
    'filter_grades',
    'noise_db',
    'has_pm25_sensor',
  ],
  'bank-savings': [
    'tenor_label',
    'tenor_months',
    'interest_rate_pct',
    'account_type',
    'product_line',
  ],
  'internet-telecom': [
    'package_kind',
    'package_code',
    'speed',
    'data_quota',
    'duration',
  ],
  'credit-cards': [
    'card_network',
    'card_tier',
    'annual_fee_vnd',
    'annual_fee_waiver_rule',
    'cashback_rate_pct',
    'cashback_cap_vnd',
    'min_income_vnd',
    'fx_fee_pct',
  ],
  'vps-hosting': [
    'vcpu',
    'ram_gb',
    'storage_gb',
    'storage_type',
    'bandwidth',
    'bandwidth_tb',
    'datacenter_location',
    'virtualization',
    'billing_cycle',
  ],
  cosmetics: [
    'product_form',
    'volume_ml_g',
    'skin_type',
    'spf_pa',
    'active_ingredients',
    'origin_country',
  ],
  'mother-baby': [
    'product_type',
    'formula_stage',
    'age_range_months',
    'weight_or_size',
    'diaper_count',
    'origin_country',
  ],
  supplements: [
    'dosage_form',
    'serving_size',
    'key_actives',
    'target_benefit',
    'is_otc_safe',
    'origin_country',
  ],
  monitors: [
    'size_inch',
    'panel_type',
    'resolution',
    'refresh_rate_hz',
    'response_time_ms',
    'curved',
    'usb_c_pd_w',
  ],
  cameras: [
    'camera_type',
    'sensor_format',
    'megapixels',
    'video_resolution',
    'lens_mount',
    'ibis',
  ],
};

/** Metadata dictionary covering all 76 canonical `custom_fields` keys across Wave E1-E6. */
export const CUSTOM_FIELD_METADATA: Readonly<Record<string, CustomFieldMeta>> =
  {
    // Wave E1: Air conditioners
    capacity_btu: {
      labels: {
        vi: 'Công suất làm lạnh',
        en: 'Cooling capacity',
        cs: 'Chladicí výkon',
      },
      kind: 'number',
      unit: 'BTU',
      higherIsBetter: true,
    },
    hp_rating: {
      labels: {
        vi: 'Công suất (HP)',
        en: 'Horsepower',
        cs: 'Výkon (HP)',
      },
      kind: 'number',
      unit: 'HP',
      higherIsBetter: true,
    },
    inverter: {
      labels: {
        vi: 'Công nghệ Inverter',
        en: 'Inverter technology',
        cs: 'Invertorová technologie',
      },
      kind: 'boolean',
      boolLabels: YES_NO_LABELS,
    },
    two_way: {
      labels: {
        vi: 'Chiều hoạt động',
        en: 'Operation mode',
        cs: 'Režim provozu',
      },
      kind: 'boolean',
      boolLabels: TWO_WAY_LABELS,
    },
    refrigerant_gas: {
      labels: {
        vi: 'Loại gas làm lạnh',
        en: 'Refrigerant gas',
        cs: 'Chladivo',
      },
      kind: 'text',
    },

    // Wave E1: Refrigerators
    capacity_liters: {
      labels: {
        vi: 'Dung tích sử dụng',
        en: 'Capacity',
        cs: 'Objem',
      },
      kind: 'number',
      unit: 'L',
      higherIsBetter: true,
    },
    door_style: {
      labels: {
        vi: 'Kiểu thiết kế cửa',
        en: 'Door style',
        cs: 'Typ dveří',
      },
      kind: 'enum',
      enumMap: DOOR_STYLE_ENUM,
    },
    energy_rating: {
      labels: {
        vi: 'Nhãn năng lượng',
        en: 'Energy rating',
        cs: 'Energetický štítek',
      },
      kind: 'energy_rating',
      higherIsBetter: true,
    },

    // Wave E1: Washing machines
    capacity_kg: {
      labels: {
        vi: 'Khối lượng giặt',
        en: 'Wash capacity',
        cs: 'Kapacita praní',
      },
      kind: 'number',
      unit: 'kg',
      higherIsBetter: true,
    },
    drum_type: {
      labels: {
        vi: 'Kiểu lồng giặt',
        en: 'Drum type',
        cs: 'Typ plnění',
      },
      kind: 'enum',
      enumMap: DRUM_TYPE_ENUM,
    },
    spin_rpm: {
      labels: {
        vi: 'Tốc độ quay vắt',
        en: 'Spin speed',
        cs: 'Rychlost odstřeďování',
      },
      kind: 'number',
      unit: { vi: 'vòng/phút', en: 'RPM', cs: 'ot./min' },
      higherIsBetter: true,
    },
    washer_dryer: {
      labels: {
        vi: 'Tích hợp sấy',
        en: 'Washer-dryer combo',
        cs: 'Kombinace se sušičkou',
      },
      kind: 'boolean',
      boolLabels: YES_NO_LABELS,
    },

    // Wave E1: TVs
    screen_size_inch: {
      labels: {
        vi: 'Kích thước màn hình',
        en: 'Screen size',
        cs: 'Úhlopříčka obrazovky',
      },
      kind: 'number',
      unit: 'inch',
      higherIsBetter: true,
    },
    panel_tech: {
      labels: {
        vi: 'Công nghệ màn hình',
        en: 'Panel technology',
        cs: 'Technologie panelu',
      },
      kind: 'text',
    },
    resolution: {
      labels: {
        vi: 'Độ phân giải',
        en: 'Resolution',
        cs: 'Rozlišení',
      },
      kind: 'text',
    },
    refresh_rate_hz: {
      labels: {
        vi: 'Tần số quét',
        en: 'Refresh rate',
        cs: 'Obnovovací frekvence',
      },
      kind: 'number',
      unit: 'Hz',
      higherIsBetter: true,
    },
    smart_os: {
      labels: {
        vi: 'Hệ điều hành TV',
        en: 'Smart TV OS',
        cs: 'Operační systém TV',
      },
      kind: 'text',
    },

    // Wave E1: Air purifiers
    cadr_m3h: {
      labels: {
        vi: 'Lưu lượng lọc khí (CADR)',
        en: 'Clean air delivery (CADR)',
        cs: 'Výkon čištění (CADR)',
      },
      kind: 'number',
      unit: 'm³/h',
      higherIsBetter: true,
    },
    room_area_m2: {
      labels: {
        vi: 'Diện tích phòng phù hợp',
        en: 'Recommended room area',
        cs: 'Doporučená plocha místnosti',
      },
      kind: 'number',
      unit: 'm²',
      higherIsBetter: true,
    },
    filter_grades: {
      labels: {
        vi: 'Bộ lọc không khí',
        en: 'Filter grades',
        cs: 'Filtry',
      },
      kind: 'list',
    },
    noise_db: {
      labels: {
        vi: 'Độ ồn hoạt động',
        en: 'Operating noise',
        cs: 'Hlučnost',
      },
      kind: 'number',
      unit: 'dB',
      higherIsBetter: false,
    },
    has_pm25_sensor: {
      labels: {
        vi: 'Cảm biến bụi mịn PM2.5',
        en: 'PM2.5 dust sensor',
        cs: 'Senzor prachu PM2.5',
      },
      kind: 'boolean',
      boolLabels: YES_NO_LABELS,
    },

    // Wave E2: Bank savings
    tenor_label: {
      labels: {
        vi: 'Kỳ hạn gửi',
        en: 'Deposit term',
        cs: 'Doba uložení',
      },
      kind: 'text',
    },
    tenor_months: {
      labels: {
        vi: 'Số tháng kỳ hạn',
        en: 'Term length',
        cs: 'Délka v měsících',
      },
      kind: 'months',
    },
    interest_rate_pct: {
      labels: {
        vi: 'Lãi suất tiết kiệm',
        en: 'Interest rate',
        cs: 'Úroková sazba',
      },
      kind: 'percent_yearly',
      higherIsBetter: true,
    },
    account_type: {
      labels: {
        vi: 'Kênh gửi tiết kiệm',
        en: 'Account channel',
        cs: 'Způsob založení',
      },
      kind: 'enum',
      enumMap: ACCOUNT_TYPE_ENUM,
    },
    product_line: {
      labels: {
        vi: 'Dòng sản phẩm',
        en: 'Product line',
        cs: 'Produktová řada',
      },
      kind: 'text',
    },

    // Wave E2: Internet & telecom
    package_kind: {
      labels: {
        vi: 'Loại gói cước',
        en: 'Plan type',
        cs: 'Typ tarifu',
      },
      kind: 'enum',
      enumMap: PACKAGE_KIND_ENUM,
    },
    package_code: {
      labels: {
        vi: 'Mã gói cước',
        en: 'Plan code',
        cs: 'Kód tarifu',
      },
      kind: 'text',
    },
    speed: {
      labels: {
        vi: 'Tốc độ đường truyền',
        en: 'Connection speed',
        cs: 'Rychlost připojení',
      },
      kind: 'text',
    },
    data_quota: {
      labels: {
        vi: 'Lưu lượng data',
        en: 'Data allowance',
        cs: 'Datový limit',
      },
      kind: 'enum',
      enumMap: BANDWIDTH_ENUM,
    },
    duration: {
      labels: {
        vi: 'Chu kỳ sử dụng',
        en: 'Billing period',
        cs: 'Doba platnosti',
      },
      kind: 'text',
    },

    // Wave E5: Credit cards
    card_network: {
      labels: {
        vi: 'Tổ chức thẻ',
        en: 'Card network',
        cs: 'Karetní síť',
      },
      kind: 'text',
    },
    card_tier: {
      labels: {
        vi: 'Hạng thẻ',
        en: 'Card tier',
        cs: 'Úroveň karty',
      },
      kind: 'text',
    },
    annual_fee_vnd: {
      labels: {
        vi: 'Phí thường niên',
        en: 'Annual fee',
        cs: 'Roční poplatek',
      },
      kind: 'vnd',
      higherIsBetter: false,
    },
    annual_fee_waiver_rule: {
      labels: {
        vi: 'Điều kiện miễn phí thường niên',
        en: 'Annual fee waiver',
        cs: 'Podmínka odpuštění poplatku',
      },
      kind: 'text',
    },
    cashback_rate_pct: {
      labels: {
        vi: 'Tỷ lệ hoàn tiền',
        en: 'Cashback rate',
        cs: 'Sazba cashbacku',
      },
      kind: 'percent',
      higherIsBetter: true,
    },
    cashback_cap_vnd: {
      labels: {
        vi: 'Mức hoàn tiền tối đa',
        en: 'Cashback cap',
        cs: 'Limit cashbacku',
      },
      kind: 'vnd',
      higherIsBetter: true,
    },
    min_income_vnd: {
      labels: {
        vi: 'Thu nhập tối thiểu',
        en: 'Minimum income',
        cs: 'Minimální příjem',
      },
      kind: 'vnd',
      higherIsBetter: false,
    },
    fx_fee_pct: {
      labels: {
        vi: 'Phí giao dịch ngoại tệ',
        en: 'Foreign transaction fee',
        cs: 'Poplatek za zahraniční platbu',
      },
      kind: 'percent',
      higherIsBetter: false,
    },

    // Wave E6: VPS & hosting
    vcpu: {
      labels: {
        vi: 'Số nhân vCPU',
        en: 'vCPU cores',
        cs: 'Počet jader vCPU',
      },
      kind: 'number',
      unit: 'vCPU',
      higherIsBetter: true,
    },
    ram_gb: {
      labels: {
        vi: 'Bộ nhớ RAM',
        en: 'Memory (RAM)',
        cs: 'Operační paměť (RAM)',
      },
      kind: 'number',
      unit: 'GB',
      higherIsBetter: true,
    },
    storage_gb: {
      labels: {
        vi: 'Dung lượng lưu trữ',
        en: 'Storage capacity',
        cs: 'Kapacita úložiště',
      },
      kind: 'number',
      unit: 'GB',
      higherIsBetter: true,
    },
    storage_type: {
      labels: {
        vi: 'Loại ổ cứng',
        en: 'Storage type',
        cs: 'Typ úložiště',
      },
      kind: 'text',
    },
    bandwidth: {
      labels: {
        vi: 'Băng thông',
        en: 'Bandwidth',
        cs: 'Přenosová rychlost',
      },
      kind: 'enum',
      enumMap: BANDWIDTH_ENUM,
    },
    bandwidth_tb: {
      labels: {
        vi: 'Lưu lượng truyền tải',
        en: 'Monthly transfer',
        cs: 'Měsíční přenos dat',
      },
      kind: 'number',
      unit: 'TB',
      higherIsBetter: true,
    },
    datacenter_location: {
      labels: {
        vi: 'Vị trí trung tâm dữ liệu',
        en: 'Datacenter location',
        cs: 'Umístění datacentra',
      },
      kind: 'text',
    },
    virtualization: {
      labels: {
        vi: 'Công nghệ ảo hóa',
        en: 'Virtualization',
        cs: 'Virtualizace',
      },
      kind: 'text',
    },
    billing_cycle: {
      labels: {
        vi: 'Chu kỳ thanh toán',
        en: 'Billing cycle',
        cs: 'Fakturační cyklus',
      },
      kind: 'enum',
      enumMap: BILLING_CYCLE_ENUM,
    },

    // Wave E3: Cosmetics
    product_form: {
      labels: {
        vi: 'Kết cấu sản phẩm',
        en: 'Product form',
        cs: 'Typ produktu',
      },
      kind: 'enum',
      enumMap: PRODUCT_FORM_ENUM,
    },
    volume_ml_g: {
      labels: {
        vi: 'Dung tích / Khối lượng',
        en: 'Volume / weight',
        cs: 'Objem / hmotnost',
      },
      kind: 'text',
    },
    skin_type: {
      labels: {
        vi: 'Loại da phù hợp',
        en: 'Skin type',
        cs: 'Typ pleti',
      },
      kind: 'enum',
      enumMap: SKIN_TYPE_ENUM,
    },
    spf_pa: {
      labels: {
        vi: 'Chỉ số chống nắng',
        en: 'Sun protection (SPF/PA)',
        cs: 'Ochranný faktor (SPF/PA)',
      },
      kind: 'text',
    },
    active_ingredients: {
      labels: {
        vi: 'Thành phần hoạt chất',
        en: 'Active ingredients',
        cs: 'Aktivní složky',
      },
      kind: 'list',
    },
    origin_country: {
      labels: {
        vi: 'Xuất xứ',
        en: 'Country of origin',
        cs: 'Země původu',
      },
      kind: 'country',
    },

    // Wave E3: Mother & baby
    product_type: {
      labels: {
        vi: 'Loại sản phẩm',
        en: 'Product type',
        cs: 'Typ produktu',
      },
      kind: 'enum',
      enumMap: MOTHER_BABY_PRODUCT_TYPE_ENUM,
    },
    formula_stage: {
      labels: {
        vi: 'Giai đoạn sữa',
        en: 'Formula stage',
        cs: 'Stupeň mléka',
      },
      kind: 'text',
    },
    age_range_months: {
      labels: {
        vi: 'Độ tuổi phù hợp',
        en: 'Suitable age',
        cs: 'Doporučený věk',
      },
      kind: 'age_months',
    },
    weight_or_size: {
      labels: {
        vi: 'Quy cách / Kích cỡ',
        en: 'Weight or size',
        cs: 'Hmotnost nebo velikost',
      },
      kind: 'text',
    },
    diaper_count: {
      labels: {
        vi: 'Số lượng miếng',
        en: 'Diaper count',
        cs: 'Počet kusů',
      },
      kind: 'number',
      unit: { vi: 'miếng', en: 'pcs', cs: 'ks' },
      higherIsBetter: true,
    },

    // Wave E3: Supplements
    dosage_form: {
      labels: {
        vi: 'Dạng bào chế',
        en: 'Dosage form',
        cs: 'Léková forma',
      },
      kind: 'enum',
      enumMap: DOSAGE_FORM_ENUM,
    },
    serving_size: {
      labels: {
        vi: 'Liều dùng khuyến nghị',
        en: 'Serving size',
        cs: 'Doporučené dávkování',
      },
      kind: 'text',
    },
    key_actives: {
      labels: {
        vi: 'Hoạt chất chính',
        en: 'Key active ingredients',
        cs: 'Klíčové účinné látky',
      },
      kind: 'list',
    },
    target_benefit: {
      labels: {
        vi: 'Công dụng chính',
        en: 'Target benefit',
        cs: 'Cílový přínos',
      },
      kind: 'enum',
      enumMap: TARGET_BENEFIT_ENUM,
    },
    is_otc_safe: {
      labels: {
        vi: 'Không kê đơn (OTC)',
        en: 'Over-the-counter (OTC)',
        cs: 'Volně prodejný (OTC)',
      },
      kind: 'boolean',
      boolLabels: YES_NO_LABELS,
    },

    // Wave E6: Monitors
    size_inch: {
      labels: {
        vi: 'Kích thước màn hình',
        en: 'Screen size',
        cs: 'Úhlopříčka obrazovky',
      },
      kind: 'number',
      unit: 'inch',
      higherIsBetter: true,
    },
    panel_type: {
      labels: {
        vi: 'Tấm nền',
        en: 'Panel type',
        cs: 'Typ panelu',
      },
      kind: 'text',
    },
    response_time_ms: {
      labels: {
        vi: 'Thời gian phản hồi',
        en: 'Response time',
        cs: 'Doba odezvy',
      },
      kind: 'number',
      unit: 'ms',
      higherIsBetter: false,
    },
    curved: {
      labels: {
        vi: 'Thiết kế màn hình',
        en: 'Screen curvature',
        cs: 'Zakřivení obrazovky',
      },
      kind: 'boolean',
      boolLabels: CURVED_LABELS,
    },
    usb_c_pd_w: {
      labels: {
        vi: 'Sạc qua USB-C (PD)',
        en: 'USB-C power delivery',
        cs: 'Napájení přes USB-C (PD)',
      },
      kind: 'number',
      unit: 'W',
      higherIsBetter: true,
    },

    // Wave E6: Cameras
    camera_type: {
      labels: {
        vi: 'Loại máy ảnh',
        en: 'Camera type',
        cs: 'Typ fotoaparátu',
      },
      kind: 'enum',
      enumMap: CAMERA_TYPE_ENUM,
    },
    sensor_format: {
      labels: {
        vi: 'Kích thước cảm biến',
        en: 'Sensor format',
        cs: 'Formát snímače',
      },
      kind: 'enum',
      enumMap: SENSOR_FORMAT_ENUM,
    },
    megapixels: {
      labels: {
        vi: 'Độ phân giải cảm biến',
        en: 'Megapixels',
        cs: 'Rozlišení snímače',
      },
      kind: 'number',
      unit: 'MP',
      higherIsBetter: true,
    },
    video_resolution: {
      labels: {
        vi: 'Quay video tối đa',
        en: 'Max video resolution',
        cs: 'Maximální rozlišení videa',
      },
      kind: 'text',
    },
    lens_mount: {
      labels: {
        vi: 'Ngàm ống kính',
        en: 'Lens mount',
        cs: 'Bajonet objektivu',
      },
      kind: 'text',
    },
    ibis: {
      labels: {
        vi: 'Chống rung thân máy (IBIS)',
        en: 'In-body stabilization (IBIS)',
        cs: 'Stabilizace v těle (IBIS)',
      },
      kind: 'boolean',
      boolLabels: YES_NO_LABELS,
    },
  };

const CATEGORY_GROUP_HEADINGS: Readonly<Record<string, LocalizedText>> = {
  'bank-savings': {
    vi: 'Thông tin kỳ hạn & lãi suất',
    en: 'Term & rate details',
    cs: 'Podmínky a úročení',
  },
  'internet-telecom': {
    vi: 'Thông số gói cước',
    en: 'Plan specifications',
    cs: 'Parametry tarifu',
  },
  'credit-cards': {
    vi: 'Phí & ưu đãi thẻ',
    en: 'Card fees & rewards',
    cs: 'Poplatky a výhody karty',
  },
  'vps-hosting': {
    vi: 'Cấu hình máy chủ',
    en: 'Server configuration',
    cs: 'Konfigurace serveru',
  },
  cosmetics: {
    vi: 'Thành phần & phù hợp da',
    en: 'Formula & skin profile',
    cs: 'Složení a typ pleti',
  },
  'mother-baby': {
    vi: 'Thông tin sản phẩm mẹ & bé',
    en: 'Product details',
    cs: 'Parametry produktu',
  },
  supplements: {
    vi: 'Công dụng & dạng bào chế',
    en: 'Formulation & benefits',
    cs: 'Složení a účinky',
  },
};

const DEFAULT_GROUP_HEADING: LocalizedText = {
  vi: 'Thông số đặc trưng',
  en: 'Category specifications',
  cs: 'Specifikace kategorie',
};

const SECTION_EYEBROW: LocalizedText = {
  vi: 'Thông số theo từng danh mục',
  en: 'Category-specific specifications',
  cs: 'Parametry podle kategorie',
};

const NUMBER_FORMATTERS: Record<RateLocale, Intl.NumberFormat> = {
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }),
  cs: new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 3 }),
};

const UPPERCASE_KEY_TOKENS = new Set([
  'btu',
  'hp',
  'rpm',
  'hz',
  'db',
  'gb',
  'tb',
  'mb',
  'ram',
  'rom',
  'ssd',
  'nvme',
  'cpu',
  'vcpu',
  'gpu',
  'usb',
  'pd',
  'hdmi',
  'dp',
  'vga',
  'wifi',
  'ibis',
  'ois',
  'spf',
  'pa',
  'otc',
  'fx',
  'vnd',
  'cadr',
  'hepa',
  'led',
  'oled',
  'qled',
  'lcd',
  'ips',
  'va',
  'hdr',
  'tv',
  'os',
  'mp',
  'ms',
  'm2',
  'm3h',
  'pm25',
  'ac',
  'dc',
  'ip',
]);

// Lowercase technical/unit abbreviations that should not trigger `lang="en"`.
const NON_ENGLISH_PROSE_TOKENS = new Set([
  'mm',
  'cm',
  'nm',
  'ml',
  'mg',
  'mcg',
  'kg',
  'iu',
  'kcal',
  'mah',
  'wh',
  'hz',
  'khz',
  'mhz',
  'ghz',
  'fps',
  'db',
  'dba',
  'ms',
  'mp',
  'gb',
  'tb',
  'mb',
  'kb',
  'mbps',
  'gbps',
  'tbps',
  'btu',
  'hp',
  'rpm',
  'inch',
  'in',
  'pcs',
  'ks',
  'vcpu',
  'nvme',
  'ssd',
  'hdd',
  'kvm',
  'ips',
  'va',
  'oled',
  'qled',
  'lcd',
  'led',
  'hdr',
  'usb',
  'hdmi',
  'srgb',
  'ntsc',
  'cmos',
  'ibis',
  'ois',
  'spf',
  'pa',
  'otc',
  'webos',
  'tizen',
  'vidaa',
  'hepa',
  'uv',
  'ph',
  'bha',
  'aha',
  'pha',
  'dha',
  'epa',
  'ala',
  'visa',
  'jcb',
  'amex',
  'mastercard',
  'ddr',
  'pcie',
  'min',
  'max',
  'pro',
  'air',
  'plus',
  'mini',
  'ultra',
]);

function ownMeta(key: string): CustomFieldMeta | undefined {
  return Object.hasOwn(CUSTOM_FIELD_METADATA, key)
    ? CUSTOM_FIELD_METADATA[key]
    : undefined;
}

function ownRecord<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

const MAX_DISPLAY_REGEX_INPUT_LEN = 500;

function normalizeLookupToken(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_DISPLAY_REGEX_INPUT_LEN)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatLocaleNumber(value: number, locale: RateLocale): string {
  return NUMBER_FORMATTERS[locale].format(value);
}

function formatVndValue(value: number, locale: RateLocale): string {
  const rounded = Math.round(value);
  const sep = locale === 'cs' ? NBSP : ' ';
  return `${formatLocaleNumber(rounded, locale)}${sep}₫`;
}

function formatPercentValue(
  value: number,
  locale: RateLocale,
  yearly: boolean
): string {
  const num = formatLocaleNumber(value, locale);
  if (yearly) {
    if (locale === 'vi') return `${num}%/năm`;
    if (locale === 'en') return `${num}%/yr`;
    return `${num}${NBSP}%/rok`;
  }
  return locale === 'cs' ? `${num}${NBSP}%` : `${num}%`;
}

function formatMonthsUnit(count: number | null, locale: RateLocale): string {
  if (locale === 'vi') return 'tháng';
  if (locale === 'en') return count === 1 ? 'month' : 'months';
  if (count === 1) return 'měsíc';
  if (count !== null && count >= 2 && count <= 4 && Number.isInteger(count)) {
    return 'měsíce';
  }
  return 'měsíců';
}

function formatDaysUnit(count: number | null, locale: RateLocale): string {
  if (locale === 'vi') return 'ngày';
  if (locale === 'en') return count === 1 ? 'day' : 'days';
  if (count === 1) return 'den';
  if (count !== null && count >= 2 && count <= 4 && Number.isInteger(count)) {
    return 'dny';
  }
  return 'dní';
}

function formatWeeksUnit(count: number | null, locale: RateLocale): string {
  if (locale === 'vi') return 'tuần';
  if (locale === 'en') return count === 1 ? 'week' : 'weeks';
  if (count === 1) return 'týden';
  if (count !== null && count >= 2 && count <= 4 && Number.isInteger(count)) {
    return 'týdny';
  }
  return 'týdnů';
}

function formatStarsValue(stars: number, locale: RateLocale): string {
  const num = formatLocaleNumber(stars, locale);
  const sep = locale === 'cs' ? NBSP : ' ';
  if (locale === 'vi') return `${num} sao`;
  if (locale === 'en') return `${num} ${stars === 1 ? 'star' : 'stars'}`;
  if (stars === 1) return `${num}${sep}hvězdička`;
  if (stars >= 2 && stars <= 4 && Number.isInteger(stars)) {
    return `${num}${sep}hvězdičky`;
  }
  return `${num}${sep}hvězdiček`;
}

function detectRawStringLang(
  text: string,
  pageLocale: RateLocale
): 'en' | 'vi' | undefined {
  const bounded =
    text.length > MAX_DISPLAY_REGEX_INPUT_LEN
      ? text.slice(0, MAX_DISPLAY_REGEX_INPUT_LEN)
      : text;
  if (isVietnamese(bounded)) {
    return pageLocale === 'vi' ? undefined : 'vi';
  }
  if (pageLocale === 'en') return undefined;
  const words = bounded.match(/\p{L}+/gu) ?? [];
  const hasLowerEnglishProse = words.some(
    (word) => /^[a-z]{2,}$/.test(word) && !NON_ENGLISH_PROSE_TOKENS.has(word)
  );
  return hasLowerEnglishProse ? 'en' : undefined;
}

/**
 * Safe sentence-case fallback label for any future `snake_case` custom field
 * not yet registered in `CUSTOM_FIELD_METADATA`.
 */
export function humanizeCustomFieldKey(key: string): string {
  const parts = key.split('_').filter(Boolean);
  if (parts.length === 0) return key;
  return parts
    .map((part, idx) => {
      if (part === 'pm25') return 'PM2.5';
      if (UPPERCASE_KEY_TOKENS.has(part)) return part.toUpperCase();
      if (idx === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(' ');
}

/**
 * Localized heading for the custom-fields spec group (no leading digit, no `(`
 * in Vietnamese, sentence case across `vi`/`en`/`cs`).
 */
export function customFieldsGroupHeading(
  locale?: string | null,
  categorySlug?: string | null
): string {
  const lang = normalizeRateLocale(locale ?? undefined);
  const slug =
    typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';
  const heading = ownRecord(CATEGORY_GROUP_HEADINGS, slug);
  return (heading ?? DEFAULT_GROUP_HEADING)[lang];
}

/**
 * Neutral section eyebrow for non-core-tech Wave E1-E6 categories that display
 * structured `custom_fields` instead of phone-shaped GSMArena/PhoneArena groups.
 */
export function customFieldsSectionEyebrow(locale?: string | null): string {
  return SECTION_EYEBROW[normalizeRateLocale(locale ?? undefined)];
}

/** Localized display label for a single canonical or fallback `custom_fields` key. */
export function customFieldLabel(key: string, locale?: string | null): string {
  const lang = normalizeRateLocale(locale ?? undefined);
  const meta = ownMeta(key);
  return meta ? meta.labels[lang] : humanizeCustomFieldKey(key);
}

/** Orders `custom_fields` keys by per-category canonical order first, then alphabetically. */
export function orderCustomFieldKeys(
  keys: Iterable<string>,
  categorySlug?: string | null
): string[] {
  const unique = Array.from(new Set(keys));
  const slug =
    typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';
  const canonical = ownRecord(CATEGORY_CUSTOM_FIELD_ORDER, slug) ?? [];
  const rank = new Map<string, number>();
  canonical.forEach((k, idx) => rank.set(k, idx));
  return unique.sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function parseFiniteNumericValue(value: CustomFieldValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function formatEnumItem(
  rawItem: string,
  enumMap: Readonly<Record<string, LocalizedText>>,
  locale: RateLocale
): { text: string; localized: boolean } {
  const token = normalizeLookupToken(rawItem);
  const entry = ownRecord(enumMap, token);
  if (entry) {
    return { text: entry[locale], localized: true };
  }
  return { text: rawItem, localized: false };
}

const ENERGY_RATING_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}(?:sao|stars?|hv[eě]zdi[cč](?:ka|ky|ek)))?$/iu;
const AGE_MONTHS_RANGE_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}(?:-|đến|to)\s{0,4}(\d+(?:[.,]\d+)?)|(\+))(?:\s{0,4}(?:tháng|thang|months?|m|měsíc[ůe]?))?$/iu;
const AGE_MONTHS_SINGLE_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}(?:tháng|thang|months?|m|měsíc[ůe]?))?$/iu;
const BANDWIDTH_UNLIMITED_PAREN_RE =
  /^(unlimited|unmetered|kh[oô]ng\s{1,4}gi[oớ]i\s{1,4}h[aạ]n)\s{0,4}\(([^()]{1,80})\)$/iu;
const TENOR_MONTHS_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}-\s{0,4}(\d+(?:[.,]\d+)?))?\s{0,4}(?:tháng|thang|months?)$/iu;
const TENOR_DAYS_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}-\s{0,4}(\d+(?:[.,]\d+)?))?\s{0,4}(?:ngày|ngay|days?)$/iu;
const TENOR_WEEKS_RE =
  /^(\d+(?:[.,]\d+)?)(?:\s{0,4}-\s{0,4}(\d+(?:[.,]\d+)?))?\s{0,4}(?:tuần|tuan|weeks?)$/iu;

function formatCustomFieldValue(
  key: string,
  raw: CustomFieldValue,
  locale: RateLocale
): Omit<CustomFieldDisplayRow, 'key' | 'label'> | null {
  const meta = ownMeta(key);
  const higherIsBetter = meta?.higherIsBetter;

  if (typeof raw === 'boolean') {
    const labels = meta?.boolLabels ?? YES_NO_LABELS;
    return {
      value: raw ? labels.true[locale] : labels.false[locale],
    };
  }

  const trimmedStr = typeof raw === 'string' ? raw.trim() : null;
  if (trimmedStr !== null && trimmedStr.length === 0) return null;
  const regexSafeStr =
    trimmedStr !== null && trimmedStr.length <= MAX_DISPLAY_REGEX_INPUT_LEN
      ? trimmedStr
      : null;

  if (meta?.kind === 'energy_rating') {
    const numeric =
      typeof raw === 'number'
        ? raw
        : regexSafeStr !== null
          ? (() => {
              const m = ENERGY_RATING_RE.exec(regexSafeStr);
              return m ? Number(m[1]!.replace(',', '.')) : null;
            })()
          : null;
    if (numeric !== null && Number.isFinite(numeric) && numeric > 0) {
      return {
        value: formatStarsValue(numeric, locale),
        numericValue: numeric,
        higherIsBetter: true,
      };
    }
  }

  if (meta?.kind === 'vnd') {
    const num = parseFiniteNumericValue(raw);
    if (num !== null) {
      return {
        value: formatVndValue(num, locale),
        ...(higherIsBetter !== undefined
          ? { numericValue: num, higherIsBetter }
          : {}),
      };
    }
  }

  if (meta?.kind === 'percent' || meta?.kind === 'percent_yearly') {
    const num = parseFiniteNumericValue(raw);
    if (num !== null) {
      return {
        value: formatPercentValue(num, locale, meta.kind === 'percent_yearly'),
        ...(higherIsBetter !== undefined
          ? { numericValue: num, higherIsBetter }
          : {}),
      };
    }
  }

  if (meta?.kind === 'months') {
    const num = parseFiniteNumericValue(raw);
    if (num !== null) {
      const sep = locale === 'cs' ? NBSP : ' ';
      return {
        value: `${formatLocaleNumber(num, locale)}${sep}${formatMonthsUnit(num, locale)}`,
      };
    }
  }

  if (meta?.kind === 'age_months') {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const sep = locale === 'cs' ? NBSP : ' ';
      return {
        value: `${formatLocaleNumber(raw, locale)}${sep}${formatMonthsUnit(raw, locale)}`,
      };
    }
    if (regexSafeStr !== null) {
      const rangeMatch = AGE_MONTHS_RANGE_RE.exec(regexSafeStr);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]!.replace(',', '.'));
        const end = rangeMatch[2]
          ? Number(rangeMatch[2].replace(',', '.'))
          : null;
        const isPlus = Boolean(rangeMatch[3]);
        const sep = locale === 'cs' ? NBSP : ' ';
        const rangeText =
          end !== null
            ? `${formatLocaleNumber(start, locale)}-${formatLocaleNumber(end, locale)}`
            : isPlus
              ? `${formatLocaleNumber(start, locale)}+`
              : formatLocaleNumber(start, locale);
        return {
          value: `${rangeText}${sep}${formatMonthsUnit(end ?? start, locale)}`,
        };
      }
      const singleMatch = AGE_MONTHS_SINGLE_RE.exec(regexSafeStr);
      if (singleMatch) {
        const singleNum = Number(singleMatch[1]!.replace(',', '.'));
        if (Number.isFinite(singleNum)) {
          const sep = locale === 'cs' ? NBSP : ' ';
          return {
            value: `${formatLocaleNumber(singleNum, locale)}${sep}${formatMonthsUnit(singleNum, locale)}`,
          };
        }
      }
    }
  }

  if (meta?.kind === 'number') {
    const num = parseFiniteNumericValue(raw);
    if (num !== null) {
      const unitText =
        typeof meta.unit === 'string'
          ? meta.unit
          : meta.unit
            ? meta.unit[locale]
            : '';
      const sep = locale === 'cs' ? NBSP : ' ';
      const value = unitText
        ? `${formatLocaleNumber(num, locale)}${sep}${unitText}`
        : formatLocaleNumber(num, locale);
      return {
        value,
        ...(higherIsBetter !== undefined
          ? { numericValue: num, higherIsBetter }
          : {}),
      };
    }
  }

  if (meta?.kind === 'country') {
    if (trimmedStr !== null) {
      const resolved = formatEnumItem(trimmedStr, ORIGIN_COUNTRY_ENUM, locale);
      const lang = resolved.localized
        ? undefined
        : detectRawStringLang(resolved.text, locale);
      return lang ? { value: resolved.text, lang } : { value: resolved.text };
    }
  }

  if (meta?.kind === 'enum' && meta.enumMap) {
    if (trimmedStr !== null) {
      // Whole-string lookup first so fractions/rates like "1/1.3-inch" or
      // "2GB/ngày" are never split or mangled.
      const whole = formatEnumItem(trimmedStr, meta.enumMap, locale);
      if (whole.localized) {
        return { value: whole.text };
      }

      if (key === 'bandwidth' && regexSafeStr !== null) {
        const bwMatch = BANDWIDTH_UNLIMITED_PAREN_RE.exec(regexSafeStr);
        if (bwMatch) {
          const prefixKey =
            bwMatch[1]!.toLowerCase() === 'unmetered'
              ? 'unmetered'
              : 'unlimited';
          const prefixText = BANDWIDTH_ENUM[prefixKey]![locale];
          const inner = bwMatch[2]!.trim();
          const text = inner ? `${prefixText} (${inner})` : prefixText;
          return { value: text };
        }
      }

      // Multi-value enums split strictly on comma/semicolon (never `/`), and
      // only rewrite when at least one part matched the enum dictionary.
      const parts = trimmedStr
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        const resolvedParts = parts.map((p) =>
          formatEnumItem(p, meta.enumMap!, locale)
        );
        if (resolvedParts.some((p) => p.localized)) {
          const text = resolvedParts.map((p) => p.text).join(', ');
          const anyRaw = resolvedParts.some((p) => !p.localized);
          const lang = anyRaw ? detectRawStringLang(text, locale) : undefined;
          return lang ? { value: text, lang } : { value: text };
        }
      }

      const lang = detectRawStringLang(trimmedStr, locale);
      return lang ? { value: trimmedStr, lang } : { value: trimmedStr };
    }
    if (Array.isArray(raw)) {
      const resolvedParts = raw.map((item) =>
        formatEnumItem(item, meta.enumMap!, locale)
      );
      if (resolvedParts.length === 0) return null;
      const text = resolvedParts.map((p) => p.text).join(', ');
      const anyRaw = resolvedParts.some((p) => !p.localized);
      const lang = anyRaw ? detectRawStringLang(text, locale) : undefined;
      return lang ? { value: text, lang } : { value: text };
    }
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const text = raw.join(', ');
    const lang = detectRawStringLang(text, locale);
    return lang ? { value: text, lang } : { value: text };
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return {
      value: formatLocaleNumber(raw, locale),
      ...(higherIsBetter !== undefined
        ? { numericValue: raw, higherIsBetter }
        : {}),
    };
  }

  // Raw string fallback (including `tenor_label`, `annual_fee_waiver_rule`, `serving_size`, etc.)
  const textOut = trimmedStr ?? raw;
  if (key === 'tenor_label' && regexSafeStr !== null) {
    const tenorNorm = normalizeLookupToken(regexSafeStr);
    if (tenorNorm === 'khong_ky_han' || tenorNorm === 'non_term') {
      const map: LocalizedText = {
        vi: 'Không kỳ hạn',
        en: 'Non-term',
        cs: 'Bez výpovědní lhůty',
      };
      return { value: map[locale] };
    }
    const formatTenorUnit = (
      match: RegExpExecArray | null,
      unitFn: (n: number | null, loc: RateLocale) => string
    ): string | null => {
      if (!match) return null;
      const start = Number(match[1]!.replace(',', '.'));
      const end = match[2] ? Number(match[2].replace(',', '.')) : null;
      if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
        return null;
      }
      const sep = locale === 'cs' ? NBSP : ' ';
      const numText =
        end !== null
          ? `${formatLocaleNumber(start, locale)}-${formatLocaleNumber(end, locale)}`
          : formatLocaleNumber(start, locale);
      return `${numText}${sep}${unitFn(end ?? start, locale)}`;
    };
    const localizedTenor =
      formatTenorUnit(TENOR_MONTHS_RE.exec(regexSafeStr), formatMonthsUnit) ??
      formatTenorUnit(TENOR_WEEKS_RE.exec(regexSafeStr), formatWeeksUnit) ??
      formatTenorUnit(TENOR_DAYS_RE.exec(regexSafeStr), formatDaysUnit);
    if (localizedTenor) {
      return { value: localizedTenor };
    }
  }

  const lang = detectRawStringLang(textOut, locale);
  return lang ? { value: textOut, lang } : { value: textOut };
}

/**
 * Formats a single sanitized `(key, value)` entry for detail or compare rendering.
 * Returns `null` when the entry cannot be rendered.
 */
export function formatCustomFieldEntry(
  key: string,
  rawValue: CustomFieldValue | undefined,
  locale?: string | null
): CustomFieldDisplayRow | null {
  if (rawValue === undefined) return null;
  const lang = normalizeRateLocale(locale ?? undefined);
  const formatted = formatCustomFieldValue(key, rawValue, lang);
  if (!formatted || !formatted.value.trim()) return null;
  return {
    key,
    label: customFieldLabel(key, lang),
    ...formatted,
  };
}

/**
 * Builds ordered, localized display rows for `specifications.custom_fields`.
 * Returns `[]` when `customFields` is empty or undefined (zero smartphone overhead).
 */
export function buildCustomFieldDisplayRows(
  customFields: CustomFields | Record<string, unknown> | null | undefined,
  categorySlug?: string | null,
  locale?: string | null
): CustomFieldDisplayRow[] {
  const safe = sanitizeCustomFields(customFields);
  if (!safe) return [];
  const lang = normalizeRateLocale(locale ?? undefined);
  const orderedKeys = orderCustomFieldKeys(Object.keys(safe), categorySlug);
  const rows: CustomFieldDisplayRow[] = [];
  for (const key of orderedKeys) {
    const row = formatCustomFieldEntry(key, safe[key], lang);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Builds `[groupHeading, label, value]` export tuples for Markdown and CSV downloads.
 * Returns `[]` when `customFields` is empty or undefined.
 */
export function buildCustomFieldExportRows(
  customFields: CustomFields | Record<string, unknown> | null | undefined,
  categorySlug?: string | null,
  locale?: string | null
): CustomFieldExportRow[] {
  const rows = buildCustomFieldDisplayRows(customFields, categorySlug, locale);
  if (rows.length === 0) return [];
  const groupTitle = customFieldsGroupHeading(locale, categorySlug);
  return rows.map((row) => [groupTitle, row.label, row.value]);
}

/** Returns compare direction (`true`/`false`) for a known numeric custom field, or `undefined`. */
export function customFieldHigherIsBetter(key: string): boolean | undefined {
  return ownMeta(key)?.higherIsBetter;
}
