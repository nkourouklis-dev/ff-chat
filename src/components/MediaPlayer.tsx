import { mediaUrl } from "../services/api";
import { driveFileId, isDriveKey } from "../services/drive";

interface Props {
  mediaKey: string;
  className?: string;
  autoPlay?: boolean;
}

// Media από το Drive παίζουν μέσα από τον player της Google. Τα υπόλοιπα (R2) από τον δικό μας.
export default function MediaPlayer({ mediaKey, className, autoPlay }: Props) {
  if (isDriveKey(mediaKey)) {
    return (
      <iframe
        className={`${className ?? ""} aspect-[9/16] w-full max-w-sm border-0`}
        src={`https://drive.google.com/file/d/${driveFileId(mediaKey)}/preview`}
        allow="autoplay; fullscreen"
        allowFullScreen
        title="Video"
      />
    );
  }
  return <video className={className} src={mediaUrl(mediaKey)} controls autoPlay={autoPlay} preload="none" playsInline />;
}
