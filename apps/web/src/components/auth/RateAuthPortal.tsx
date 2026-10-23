'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';
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
  'login' | 'register' | 'forgot-password' | 'two-factor-auth';

interface RateAuthPortalProps {
  mode: RateAuthMode;
  locale?: string;
}

export default function RateAuthPortal({ mode }: RateAuthPortalProps) {
  const t = useTranslations('authPortal');
  const copy = {
    badge: t('badge'),
    trustTitle: t('trustTitle'),
    trustSubtitle: t('trustSubtitle'),
    feature1Title: t('feature1Title'),
    feature1Desc: t('feature1Desc'),
    feature2Title: t('feature2Title'),
    feature2Desc: t('feature2Desc'),
    feature3Title: t('feature3Title'),
    feature3Desc: t('feature3Desc'),
    loginTitle: t('loginTitle'),
    loginSub: t('loginSub'),
    registerTitle: t('registerTitle'),
    registerSub: t('registerSub'),
    forgotTitle: t('forgotTitle'),
    forgotSub: t('forgotSub'),
    otpTitle: t('otpTitle'),
    otpSub: t('otpSub'),
    fullNameLabel: t('fullNameLabel'),
    fullNamePlaceholder: t('fullNamePlaceholder'),
    emailLabel: t('emailLabel'),
    emailPlaceholder: t('emailPlaceholder'),
    passwordLabel: t('passwordLabel'),
    passwordPlaceholder: t('passwordPlaceholder'),
    confirmPasswordLabel: t('confirmPasswordLabel'),
    confirmPasswordPlaceholder: t('confirmPasswordPlaceholder'),
    otpLabel: t('otpLabel'),
    otpPlaceholder: t('otpPlaceholder'),
    loginBtn: t('loginBtn'),
    registerBtn: t('registerBtn'),
    forgotBtn: t('forgotBtn'),
    otpVerifyBtn: t('otpVerifyBtn'),
    sendMagicOtpBtn: t('sendMagicOtpBtn'),
    submitting: t('submitting'),
    switchToRegister: t('switchToRegister'),
    switchToLogin: t('switchToLogin'),
    forgotLink: t('forgotLink'),
    otpLink: t('otpLink'),
    errPasswordMismatch: t('errPasswordMismatch'),
    errPasswordShort: t('errPasswordShort', { min: PASSWORD_MIN_LENGTH }),
    errInvalidCredentials: t('errInvalidCredentials'),
    errGeneric: t('errGeneric'),
    okLogin: t('okLogin'),
    okRegister: t('okRegister'),
    okResetSent: t('okResetSent'),
    okOtpSent: t('okOtpSent'),
    okOtpVerified: t('okOtpVerified'),
  };
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

  const redirectTarget = searchParams.get('callbackUrl') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
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

        if (sbError || !sbData?.session) {
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
          router.push(redirectTarget);
        }
        setLoading(false);
        return;
      }

      if (mode === 'forgot-password') {
        const origin =
          typeof window !== 'undefined'
            ? window.location.origin
            : 'https://rate.vn';
        const { error } = await supabase.auth.resetPasswordForEmail(
          trimmedEmail,
          {
            redirectTo: `${origin}/login`,
          }
        );

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
      const supabase = getBrowserSupabase();
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
      <div className="py-lg-4 container">
        <div className="row g-4 align-items-stretch">
          {/* Left Column: Rate.vn Trust & Security Architecture */}
          <div className="col-lg-6 d-flex order-2 order-lg-1">
            <div className="card rounded-4 bg-dark p-xl-5 d-flex flex-column justify-content-between w-100 border-0 p-4 text-white shadow-sm">
              <div>
                <div className="d-inline-flex align-items-center bg-danger bg-opacity-25 rounded-pill small fw-medium mb-3 gap-2 px-3 py-1 text-white">
                  <BsShieldLockFill className="text-danger" />
                  <span>{copy.badge}</span>
                </div>
                <h1 className="h2 fw-bold mb-3 text-white">
                  {copy.trustTitle}
                </h1>
                <p className="text-white-50 mb-4">{copy.trustSubtitle}</p>

                <div className="d-flex flex-column gap-3">
                  <div className="rounded-3 bg-opacity-10 d-flex align-items-start gap-3 bg-white p-3">
                    <div className="rounded-3 bg-danger flex-shrink-0 p-2 text-white">
                      <BsStarFill />
                    </div>
                    <div>
                      <div className="fw-semibold mb-1 text-white">
                        {copy.feature1Title}
                      </div>
                      <div className="small text-white-50">
                        {copy.feature1Desc}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3 bg-opacity-10 d-flex align-items-start gap-3 bg-white p-3">
                    <div className="rounded-3 bg-primary flex-shrink-0 p-2 text-white">
                      <BsBellFill />
                    </div>
                    <div>
                      <div className="fw-semibold mb-1 text-white">
                        {copy.feature2Title}
                      </div>
                      <div className="small text-white-50">
                        {copy.feature2Desc}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3 bg-opacity-10 d-flex align-items-start gap-3 bg-white p-3">
                    <div className="rounded-3 bg-success flex-shrink-0 p-2 text-white">
                      <BsShieldCheck />
                    </div>
                    <div>
                      <div className="fw-semibold mb-1 text-white">
                        {copy.feature3Title}
                      </div>
                      <div className="small text-white-50">
                        {copy.feature3Desc}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-top border-secondary border-opacity-25 d-flex mt-4 flex-wrap gap-2 pt-3">
                <Link
                  href="/smartphones"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('pillSmartphones')}
                </Link>
                <Link
                  href="/laptops"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('pillLaptops')}
                </Link>
                <Link
                  href="/merchants"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('pillMerchants')}
                </Link>
                <Link
                  href="/watchlist"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('pillWatchlist')}
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Supabase Auth Form */}
          <div className="col-lg-6 d-flex order-1 order-lg-2">
            <div className="card rounded-4 p-xl-5 w-100 border-0 bg-white p-4 shadow-sm">
              {/* Mode Switcher Pills */}
              <div className="d-flex border-bottom mb-4 flex-wrap gap-2 pb-3">
                <Link
                  href="/login"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'login'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  {t('tabLogin')}
                </Link>
                <Link
                  href="/register"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'register'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  {t('tabRegister')}
                </Link>
                <Link
                  href="/two-factor-auth"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'two-factor-auth'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  {t('tabOtp')}
                </Link>
                <Link
                  href="/forgot-password"
                  className={`btn btn-sm rounded-pill px-3 ${
                    mode === 'forgot-password'
                      ? 'btn-danger fw-semibold'
                      : 'btn-light text-muted'
                  }`}
                >
                  {t('tabReset')}
                </Link>
              </div>

              <h2 className="h3 fw-bold text-dark mb-2">{headingTitle}</h2>
              <p className="text-muted small mb-4">{headingSub}</p>

              {errorMessage && (
                <div
                  className="alert alert-danger d-flex align-items-center rounded-3 small gap-2 py-2"
                  role="alert"
                >
                  <BsExclamationTriangleFill className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div
                  className="alert alert-success d-flex align-items-center rounded-3 small gap-2 py-2"
                  role="status"
                >
                  <BsCheckCircleFill className="flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="d-flex flex-column gap-3"
              >
                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="rate-auth-fullname"
                      className="form-label small fw-semibold text-dark"
                    >
                      <BsPersonFill className="text-danger me-1" />
                      {copy.fullNameLabel}
                    </label>
                    <input
                      id="rate-auth-fullname"
                      type="text"
                      autoComplete="name"
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
                    <BsEnvelopeFill className="text-danger me-1" />
                    {copy.emailLabel}
                  </label>
                  <input
                    id="rate-auth-email"
                    type="email"
                    autoComplete="email"
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
                        <BsLockFill className="text-danger me-1" />
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
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
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
                      <BsKeyFill className="text-danger me-1" />
                      {copy.confirmPasswordLabel}
                    </label>
                    <input
                      id="rate-auth-confirm"
                      type="password"
                      autoComplete="new-password"
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
                        <BsKeyFill className="text-danger me-1" />
                        {copy.otpLabel}
                      </label>
                      <button
                        type="button"
                        onClick={handleSendOtpCode}
                        disabled={loading || !email.trim()}
                        className="btn btn-link btn-sm text-danger text-decoration-none fw-medium p-0"
                      >
                        {copy.sendMagicOtpBtn}
                      </button>
                    </div>
                    <input
                      id="rate-auth-otp"
                      type="text"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={8}
                      className="form-control rounded-3 fw-bold fs-5 letter-spacing-2 text-center"
                      placeholder={copy.otpPlaceholder}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value)}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-danger rounded-pill fw-semibold d-flex align-items-center justify-content-center mt-2 gap-2 py-2"
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

              <div className="border-top d-flex justify-content-between align-items-center small mt-4 flex-wrap gap-2 pt-3">
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
