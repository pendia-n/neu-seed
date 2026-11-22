import { useEffect, useRef, useState } from "react";

export function SeedText({ text }: { text: string }) {
  const preview = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const element = preview.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <p ref={preview} className="seed-text-preview">{text}</p>
      {truncated && (
        <button
          type="button"
          className="editseed"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => dialog.current?.showModal()}
        >
          Read more
        </button>
      )}
      <dialog
        ref={dialog}
        className="modal seed-reader"
        aria-label="Full seed text"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <h2>Seed text</h2>
        <p>{text}</p>
        <form method="dialog">
          <button className="primary" autoFocus>Close</button>
        </form>
      </dialog>
    </>
  );
}
