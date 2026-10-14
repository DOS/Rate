'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/lib/navigation';
import { getPublicClient } from '@repo/shared-data';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';
import { normalizeRateLocale, type SupportedRateLocale } from '@/lib/rate-i18n';
import {
  BsArrowRight,
  BsBellFill,
  BsCheckCircleFill,
  BsEnvelopeFill,
  BsExclamationTriangleFill,
  BsKeyFill,
  BsLockFill,
  BsPersonFill,
  BsShieldCheck,
  BsShieldLockFill,
  BsStarFill,
} from 'react-icons/bs';

export type RateAuthMode =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'two-factor-auth';

interface RateAuthPortalProps {
  mode: RateAuthMode;
  locale?: string;
}

interface AuthLocaleText {
  badge: string;
  trustTitle: string;
  trustSubtitle: string;
  feature1Title: string;
  feature1Desc: string;
  feature2Title: string;
  feature2Desc: string;
  feature3Title: string;
  feature3Desc: string;
  loginTitle: string;
  loginSub: string;
  registerTitle: string;
  registerSub: string;
  forgotTitle: string;
  forgotSub: string;
  otpTitle: string;
  otpSub: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  confirmPasswordLabel: string;
  confirmPasswordPlaceholder: string;
  otpLabel: string;
  otpPlaceholder: string;
  loginBtn: string;
  registerBtn: string;
  forgotBtn: string;
  otpVerifyBtn: string;
  sendMagicOtpBtn: string;
  submitting: string;
  switchToRegister: string;
  switchToLogin: string;
  forgotLink: string;
  otpLink: string;
  errPasswordMismatch: string;
  errPasswordShort: string;
  errInvalidCredentials: string;
  errGeneric: string;
  okLogin: string;
  okRegister: string;
  okResetSent: string;
  okOtpSent: string;
  okOtpVerified: string;
}

const AUTH_COPY: Record<SupportedRateLocale, AuthLocaleText> = {
  vi: {
    badge: 'Hệ Thống Định Danh Bảo Mật Supabase Auth (DOS Ecosystem)',
    trustTitle: 'Tài Khoản Người Mua Độc Lập Trên Rate.vn',
    trustSubtitle:
      'Đồng bộ danh sách canh giá thật, gửi đánh giá 5 tiêu chí JReviews và biểu quyết bình luận hữu ích mà không tiết lộ thông tin cá nhân cho các gian hàng TMĐT.',
    feature1Title: 'Bảo vệ Biểu quyết JReviews (rate.review_votes)',
    feature1Desc:
      'Mỗi tài khoản xác thực giúp chống thao túng trọng số Helpful/Report trên hệ thống đánh giá kỹ thuật 5 tiêu chí.',
    feature2Title: 'Đồng bộ Danh sách Canh giá thật (/watchlist)',
    feature2Desc:
      'Lưu trữ ngưỡng giá mục tiêu cho điện thoại, laptop, máy tính bảng, đồng hồ và tai nghe trên đám mây.',
    feature3Title: 'Kiến trúc Zero-Trust & Không chia sẻ cho Sàn',
    feature3Desc:
      'Dữ liệu định danh được bảo vệ bởi Row Level Security (RLS) trên PostgreSQL 17 của hệ sinh thái DOS.',
    loginTitle: 'Đăng Nhập Tài Khoản Rate.vn',
    loginSub: 'Sử dụng email và mật khẩu hoặc nhận mã xác thực OTP một lần qua email.',
    registerTitle: 'Tạo Tài Khoản Kiểm Toán Người Mua',
    registerSub: 'Tham gia cộng đồng đánh giá thông số 10 nhóm và canh giá thật đa sàn.',
    forgotTitle: 'Khôi Phục Mật Khẩu Tài Khoản',
    forgotSub: 'Nhập địa chỉ email đã đăng ký để nhận liên kết đặt lại mật khẩu an toàn từ Supabase Auth.',
    otpTitle: 'Xác Thực Hai Lớp & Mã OTP Email',
    otpSub: 'Nhập mã xác thực 6 chữ số được gửi tới hộp thư của bạn để hoàn tất đăng nhập bảo mật.',
    fullNameLabel: 'Họ và tên hiển thị',
    fullNamePlaceholder: 'Nguyễn Văn A',
    emailLabel: 'Địa chỉ Email',
    emailPlaceholder: 'ban@rate.vn',
    passwordLabel: 'Mật khẩu bảo mật',
    passwordPlaceholder: 'Tối thiểu 6 ký tự',
    confirmPasswordLabel: 'Xác nhận lại mật khẩu',
    confirmPasswordPlaceholder: 'Nhập lại mật khẩu',
    otpLabel: 'Mã xác thực OTP (6 chữ số)',
    otpPlaceholder: '123456',
    loginBtn: 'Đăng nhập vào Rate.vn',
    registerBtn: 'Đăng ký tài khoản mới',
    forgotBtn: 'Gửi liên kết đặt lại mật khẩu',
    otpVerifyBtn: 'Xác nhận mã OTP & Đăng nhập',
    sendMagicOtpBtn: 'Gửi mã OTP tới Email này',
    submitting: 'Đang xử lý yêu cầu...',
    switchToRegister: 'Chưa có tài khoản? Đăng ký ngay',
    switchToLogin: 'Đã có tài khoản? Quay lại Đăng nhập',
    forgotLink: 'Quên mật khẩu?',
    otpLink: 'Đăng nhập bằng mã OTP / 2FA',
    errPasswordMismatch: 'Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.',
    errPasswordShort: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
    errInvalidCredentials:
      'Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa được kích hoạt.',
    errGeneric: 'Không thể hoàn tất yêu cầu xác thực. Vui lòng kiểm tra lại thông tin.',
    okLogin: 'Đăng nhập thành công! Đang chuyển hướng...',
    okRegister:
      'Đăng ký tài khoản thành công! Vui lòng kiểm tra hộp thư email để xác nhận hoặc đăng nhập ngay.',
    okResetSent:
      'Đã gửi hướng dẫn đặt lại mật khẩu tới email của bạn. Vui lòng kiểm tra hộp thư đến (và thư mục Spam).',
    okOtpSent:
      'Đã gửi mã OTP 6 chữ số tới email của bạn. Vui lòng nhập mã bên dưới để hoàn tất xác thực.',
    okOtpVerified: 'Xác thực OTP thành công! Đang chuyển hướng về trang chủ...',
  },
  en: {
    badge: 'Supabase Auth Identity Layer (DOS Ecosystem)',
    trustTitle: 'Independent Buyer Audit Account on Rate.vn',
    trustSubtitle:
      'Sync your true-price watchlist, submit 5-criteria JReviews technical ratings, and vote on authentic buyer reviews without exposing your identity to marketplace sellers.',
    feature1Title: 'Authenticated JReviews Voting (rate.review_votes)',
    feature1Desc:
      'Verified accounts prevent manipulation of Helpful/Report weights across our 5-criteria technical review engine.',
    feature2Title: 'Cross-Device Price Watchlist (/watchlist)',
    feature2Desc:
      'Track target price thresholds across smartphones, laptops, tablets, smartwatches, and earbuds.',
    feature3Title: 'Zero-Trust PostgreSQL 17 RLS Isolation',
    feature3Desc:
      'Your identity is protected by strict Row Level Security on the DOS Ecosystem Supabase infrastructure.',
    loginTitle: 'Sign In to Rate.vn',
    loginSub: 'Sign in with your email and password or request a one-time email OTP code.',
    registerTitle: 'Create a Buyer Audit Account',
    registerSub: 'Join the open community auditing 10-group specs and real historical prices.',
    forgotTitle: 'Reset Your Account Password',
    forgotSub: 'Enter your registered email address to receive a password reset link via Supabase Auth.',
    otpTitle: 'Two-Factor & Email OTP Verification',
    otpSub: 'Enter the 6-digit verification code sent to your email inbox to complete sign-in.',
    fullNameLabel: 'Display Name',
    fullNamePlaceholder: 'Alex Nguyen',
    emailLabel: 'Email Address',
    emailPlaceholder: 'you@rate.vn',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Minimum 6 characters',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter your password',
    otpLabel: '6-Digit OTP Verification Code',
    otpPlaceholder: '123456',
    loginBtn: 'Sign In to Rate.vn',
    registerBtn: 'Create Account',
    forgotBtn: 'Send Password Reset Link',
    otpVerifyBtn: 'Verify OTP & Sign In',
    sendMagicOtpBtn: 'Send OTP Code to Email',
    submitting: 'Processing request...',
    switchToRegister: 'New to Rate.vn? Create an account',
    switchToLogin: 'Already have an account? Back to Sign In',
    forgotLink: 'Forgot password?',
    otpLink: 'Sign in with Email OTP / 2FA',
    errPasswordMismatch: 'Passwords do not match. Please double-check.',
    errPasswordShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    errInvalidCredentials:
      'Invalid email or password, or the account has not been confirmed yet.',
    errGeneric: 'Could not complete authentication request. Please verify your details.',
    okLogin: 'Signed in successfully! Redirecting...',
    okRegister:
      'Account created! Please check your email inbox for confirmation or sign in directly.',
    okResetSent:
      'Password reset instructions have been sent to your email address.',
    okOtpSent:
      'A 6-digit OTP code has been sent to your email. Enter it below to verify.',
    okOtpVerified: 'OTP verified successfully! Redirecting...',
  },
  cs: {
    badge: 'Autentizační vrstva Supabase Auth (DOS Ecosystem)',
    trustTitle: 'Nezávislý účet kupujícího na Rate.vn',
    trustSubtitle:
      'Synchronizujte své hlídání skutečných cen, přidávejte 5kritériové recenze JReviews a hlasujte o užitečnosti bez sdílení osobních údajů s e-shopy.',
    feature1Title: 'Ověřené hlasování JReviews (rate.review_votes)',
    feature1Desc:
      'Ověřené účty chrání vážené skóre užitečnosti recenzí před manipulací a seedingem.',
    feature2Title: 'Synchronizace hlídaných cen (/watchlist)',
    feature2Desc:
      'Sledujte cílové ceny pro telefony, notebooky, tablety, chytré hodinky a sluchátka.',
    feature3Title: 'Zero-Trust PostgreSQL 17 RLS ochrana',
    feature3Desc:
      'Vaše identita je chráněna politikami Row Level Security v infrastruktuře DOS.',
    loginTitle: 'Přihlášení k účtu Rate.vn',
    loginSub: 'Přihlaste se pomocí e-mailu a hesla nebo jednorázového OTP kódu.',
    registerTitle: 'Vytvořit účet na Rate.vn',
    registerSub: 'Připojte se ke komunitě kontrolující 10 skupin parametrů a skutečné ceny.',
    forgotTitle: 'Obnovení zapomenutého hesla',
    forgotSub: 'Zadejte svůj registrovaný e-mail pro zaslání odkazu k obnovení hesla přes Supabase Auth.',
    otpTitle: 'Dvoufázové ověření a e-mailový OTP kód',
    otpSub: 'Zadejte 6místný ověřovací kód zaslaný na váš e-mail.',
    fullNameLabel: 'Zobrazované jméno',
    fullNamePlaceholder: 'Jan Novák',
    emailLabel: 'E-mailová adresa',
    emailPlaceholder: 'vas@rate.vn',
    passwordLabel: 'Heslo',
    passwordPlaceholder: 'Minimálně 6 znaků',
    confirmPasswordLabel: 'Potvrzení hesla',
    confirmPasswordPlaceholder: 'Zadejte heslo znovu',
    otpLabel: '6místný ověřovací OTP kód',
    otpPlaceholder: '123456',
    loginBtn: 'Přihlásit se na Rate.vn',
    registerBtn: 'Vytvořit účet',
    forgotBtn: 'Odeslat odkaz pro obnovu hesla',
    otpVerifyBtn: 'Ověřit OTP a přihlásit se',
    sendMagicOtpBtn: 'Odeslat OTP kód na e-mail',
    submitting: 'Zpracovávání požadavku...',
    switchToRegister: 'Nemáte účet? Zaregistrujte se',
    switchToLogin: 'Již máte účet? Zpět na přihlášení',
    forgotLink: 'Zapomněli jste heslo?',
    otpLink: 'Přihlášení přes OTP / 2FA',
    errPasswordMismatch: 'Zadaná hesla se neshodují.',
    errPasswordShort: `Heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.`,
    errInvalidCredentials: 'Neplatný e-mail nebo heslo.',
    errGeneric: 'Požadavek se nepodařilo dokončit. Zkontrolujte zadané údaje.',
    okLogin: 'Přihlášení proběhlo úspěšně! Přesměrování...',
    okRegister: 'Účet byl vytvořen! Zkontrolujte svůj e-mail pro potvrzení.',
    okResetSent: 'Pokyny pro obnovení hesla byly odeslány na váš e-mail.',
    okOtpSent: '6místný OTP kód byl odeslán na váš e-mail.',
    okOtpVerified: 'OTP kód byl úspěšně ověřen! Přesměrování...',
  },
};

export default function RateAuthPortal({ mode, locale }: RateAuthPortalProps) {
  const normalizedLocale = normalizeRateLocale(locale);
  const copy = AUTH_COPY[normalizedLocale];
  const router = useRouter();
  const searchParams = useSearchParams();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.get('error') ? copy.errInvalidCredentials : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const redirectTarget =
    searchParams.get('callbackUrl') ||
    (normalizedLocale === 'vi' ? '/' : `/${normalizedLocale}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const supabase = getPublicClient();
      const trimmedEmail = email.trim();

      if (mode === 'login') {
        if (password.length < PASSWORD_MIN_LENGTH) {
          setErrorMessage(copy.errPasswordShort);
          setLoading(false);
          return;
        }

        const { data: sbData, error: sbError } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });

        const nextAuthResult = await signIn('credentials', {
          email: trimmedEmail,
          password,
          redirect: false,
        });

        if ((sbError && !nextAuthResult?.ok) || (!sbData?.session && !nextAuthResult?.ok)) {
          setErrorMessage(sbError?.message || copy.errInvalidCredentials);
          setLoading(false);
          return;
        }

        setSuccessMessage(copy.okLogin);
        router.push(redirectTarget);
        router.refresh();
        return;
      }

      if (mode === 'register') {
        if (password.length < PASSWORD_MIN_LENGTH) {
          setErrorMessage(copy.errPasswordShort);
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMessage(copy.errPasswordMismatch);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || trimmedEmail.split('@')[0],
            },
          },
        });

        if (error) {
          setErrorMessage(error.message || copy.errGeneric);
          setLoading(false);
          return;
        }

        setSuccessMessage(copy.okRegister);
        if (data?.session) {
          await signIn('credentials', {
            email: trimmedEmail,
            password,
            redirect: false,
          });
          router.push(redirectTarget);
        }
        setLoading(false);
        return;
      }

      if (mode === 'forgot-password') {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'https://rate.vn';
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${origin}/login`,
        });

        if (error) {
          setErrorMessage(error.message || copy.errGeneric);
          setLoading(false);
          return;
        }

        setSuccessMessage(copy.okResetSent);
        setLoading(false);
        return;
      }

      if (mode === 'two-factor-auth') {
        const cleanOtp = otpToken.trim();
        if (!cleanOtp) {
          const { error } = await supabase.auth.signInWithOtp({
            email: trimmedEmail,
          });
          if (error) {
            setErrorMessage(error.message || copy.errGeneric);
          } else {
            setSuccessMessage(copy.okOtpSent);
          }
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token: cleanOtp,
          type: 'email',
        });

        if (error) {
          setErrorMessage(error.message || copy.errGeneric);
          setLoading(false);
          return;
        }

        setSuccessMessage(copy.okOtpVerified);
        router.push(redirectTarget);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : copy.errGeneric);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtpCode = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const supabase = getPublicClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
      });
      if (error) {
        setErrorMessage(error.message || copy.errGeneric);
      } else {
        setSuccessMessage(copy.okOtpSent);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : copy.errGeneric);
    } finally {
      setLoading(false);
    }
  };

  const headingTitle =
    mode === 'login'
      ? copy.loginTitle
      : mode === 'register'
      ? copy.registerTitle
      : mode === 'forgot-password'
      ? copy.forgotTitle
      : copy.otpTitle;

  const headingSub =
    mode === 'login'
      ? copy.loginSub
      : mode === 'register'
      ? copy.registerSub
      : mode === 'forgot-password'
      ? copy.forgotSub
      : copy.otpSub;

  return (
    <section className="bg-light py-5">
      <div className="container py-lg-4">
        <div className="row g-4 align-items-stretch">
          {/* Left Column: Rate.vn Trust & Security Architecture */}
          <div className="col-lg-6 d-flex">
            <div className="card border-0 rounded-4 shadow-sm bg-dark text-white p-4 p-xl-5 w-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-inline-flex align-items-center gap-2 bg-danger bg-opacity-25 text-white px-3 py-1 rounded-pill small fw-medium mb-3">
                  <BsShieldLockFill className="text-danger" />
                  <span>{copy.badge}</span>
                </div>
                <h1 className="h2 fw-bold text-white mb-3">{copy.trustTitle}</h1>
                <p className="text-white-50 mb-4">{copy.trustSubtitle}</p>

                <div className="d-flex flex-column gap-3">
                  <div className="p-3 rounded-3 bg-white bg-opacity-10 d-flex align-items-start gap-3">
                    <div className="p-2 rounded-3 bg-danger text-white flex-shrink-0">
                      <BsStarFill />
                    </div>
                    <div>
                      <div className="fw-semibold text-white mb-1">
                        {copy.feature1Title}
                      </div>
                      <div className="small text-white-50">{copy.feature1Desc}</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-3 bg-white bg-opacity-10 d-flex align-items-start gap-3">
                    <div className="p-2 rounded-3 bg-primary text-white flex-shrink-0">
                      <BsBellFill />
                    </div>
                    <div>
                      <div className="fw-semibold text-white mb-1">
                        {copy.feature2Title}
                      </div>
                      <div className="small text-white-50">{copy.feature2Desc}</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-3 bg-white bg-opacity-10 d-flex align-items-start gap-3">
                    <div className="p-2 rounded-3 bg-success text-white flex-shrink-0">
                      <BsShieldCheck />
                    </div>
                    <div>
                      <div className="fw-semibold text-white mb-1">
                        {copy.feature3Title}
                      </div>
                      <div className="small text-white-50">{copy.feature3Desc}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-top border-secondary border-opacity-25 d-flex flex-wrap gap-2">
                <Link
                  href="/smartphones"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  📱 Smartphones
                </Link>
                <Link
                  href="/laptops"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  💻 Laptops
                </Link>
                <Link
                  href="/merchants"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  🛡️ Merchants
                </Link>
                <Link
                  href="/watchlist"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  🔔 Watchlist
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Supabase Auth Form */}
          <div className="col-lg-6 d-flex">
            <div className="card border-0 rounded-4 shadow-sm p-4 p-xl-5 w-100 bg-white">
              {/* Mode Switcher Pills */}
              <div className="d-flex flex-wrap gap-2 mb-4 pb-3 border-bottom">
                <Link
                  href="/login"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'login' ? 'btn-danger fw-semibold' : 'btn-light text-muted'
                  }`}
                >
                  🔑 Login
                </Link>
                <Link
                  href="/register"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'register'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  ✨ Register
                </Link>
                <Link
                  href="/two-factor-auth"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'two-factor-auth'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  🛡️ Email OTP / 2FA
                </Link>
                <Link
                  href="/forgot-password"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'forgot-password'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  🔄 Reset
                </Link>
              </div>

              <h2 className="h3 fw-bold text-dark mb-2">{headingTitle}</h2>
              <p className="text-muted small mb-4">{headingSub}</p>

              {errorMessage && (
                <div
                  className="alert alert-danger d-flex align-items-center gap-2 rounded-3 py-2 small"
                  role="alert"
                >
                  <BsExclamationTriangleFill className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div
                  className="alert alert-success d-flex align-items-center gap-2 rounded-3 py-2 small"
                  role="status"
                >
                  <BsCheckCircleFill className="flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="rate-auth-fullname"
                      className="form-label small fw-semibold text-dark"
                    >
                      <BsPersonFill className="me-1 text-danger" />
                      {copy.fullNameLabel}
                    </label>
                    <input
                      id="rate-auth-fullname"
                      type="text"
                      className="form-control rounded-3"
                      placeholder={copy.fullNamePlaceholder}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="rate-auth-email"
                    className="form-label small fw-semibold text-dark"
                  >
                    <BsEnvelopeFill className="me-1 text-danger" />
                    {copy.emailLabel}
                  </label>
                  <input
                    id="rate-auth-email"
                    type="email"
                    className="form-control rounded-3"
                    placeholder={copy.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {(mode === 'login' || mode === 'register') && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center">
                      <label
                        htmlFor="rate-auth-password"
                        className="form-label small fw-semibold text-dark mb-1"
                      >
                        <BsLockFill className="me-1 text-danger" />
                        {copy.passwordLabel}
                      </label>
                      {mode === 'login' && (
                        <Link
                          href="/forgot-password"
                          className="small text-danger text-decoration-none fw-medium"
                        >
                          {copy.forgotLink}
                        </Link>
                      )}
                    </div>
                    <input
                      id="rate-auth-password"
                      type="password"
                      className="form-control rounded-3"
                      placeholder={copy.passwordPlaceholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </div>
                )}

                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="rate-auth-confirm"
                      className="form-label small fw-semibold text-dark"
                    >
                      <BsKeyFill className="me-1 text-danger" />
                      {copy.confirmPasswordLabel}
                    </label>
                    <input
                      id="rate-auth-confirm"
                      type="password"
                      className="form-control rounded-3"
                      placeholder={copy.confirmPasswordPlaceholder}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </div>
                )}

                {mode === 'two-factor-auth' && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label
                        htmlFor="rate-auth-otp"
                        className="form-label small fw-semibold text-dark mb-0"
                      >
                        <BsKeyFill className="me-1 text-danger" />
                        {copy.otpLabel}
                      </label>
                      <button
                        type="button"
                        onClick={handleSendOtpCode}
                        disabled={loading || !email.trim()}
                        className="btn btn-link btn-sm p-0 text-danger text-decoration-none fw-medium"
                      >
                        {copy.sendMagicOtpBtn}
                      </button>
                    </div>
                    <input
                      id="rate-auth-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      className="form-control rounded-3 text-center fw-bold fs-5 letter-spacing-2"
                      placeholder={copy.otpPlaceholder}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value)}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-danger rounded-pill py-2 fw-semibold d-flex align-items-center justify-content-center gap-2 mt-2"
                >
                  <span>
                    {loading
                      ? copy.submitting
                      : mode === 'login'
                      ? copy.loginBtn
                      : mode === 'register'
                      ? copy.registerBtn
                      : mode === 'forgot-password'
                      ? copy.forgotBtn
                      : otpToken.trim()
                      ? copy.otpVerifyBtn
                      : copy.sendMagicOtpBtn}
                  </span>
                  <BsArrowRight />
                </button>
              </form>

              <div className="mt-4 pt-3 border-top d-flex flex-wrap justify-content-between align-items-center gap-2 small">
                {mode === 'login' ? (
                  <>
                    <Link
                      href="/register"
                      className="text-dark fw-semibold text-decoration-none"
                    >
                      {copy.switchToRegister}
                    </Link>
                    <Link
                      href="/two-factor-auth"
                      className="text-muted text-decoration-none"
                    >
                      {copy.otpLink}
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="text-dark fw-semibold text-decoration-none"
                  >
                    {copy.switchToLogin}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
