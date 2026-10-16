import { Spinner } from '@/components/elementary/Spinner';

export default function Loading() {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center bg-light gap-3 py-5">
      <Spinner className="border-danger size-8 border-3" />
      <div className="small fw-semibold text-muted">
        Rate.vn - 10 Spec Groups &amp; Price History...
      </div>
    </div>
  );
}
