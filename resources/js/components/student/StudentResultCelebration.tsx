import { ArrowRight, Download, GraduationCap, Sparkles } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties } from 'react';
import '../../../css/student-result-celebration.css';

const universityName = 'Université Simon Kimbangu';
const crestUrl = '/assets/usk/logo.png';

type CelebrationProps = {
    studentName: string;
    semesterLabel: string;
    yearLabel?: string;
    facultyName?: string;
    photoUrl?: string | null;
    onViewResults: () => void;
};

const confetti = Array.from({ length: 28 }, (_, index) => {
    const angle = index * 2.39996;
    const distance = 6 + (index % 6) * 1.9;
    return {
        '--celebration-x': `${Math.cos(angle) * distance}rem`,
        '--celebration-y': `${Math.sin(angle) * distance}rem`,
        '--celebration-turn': `${index % 2 ? -310 : 275}deg`,
        '--celebration-delay': `${(index % 7) * 42}ms`,
    } as CSSProperties;
});

function initialsFor(name: string) {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => Array.from(word)[0])
            .join('')
            .toLocaleUpperCase('fr') || 'USK'
    );
}

async function readyImage(image: HTMLImageElement | null) {
    if (!image) return null;
    try {
        await image.decode();
        return image;
    } catch {
        return null;
    }
}

function drawPortrait(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, radius: number) {
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        x - radius,
        y - radius,
        radius * 2,
        radius * 2,
    );
    context.restore();
}

function createCelebrationImage(
    studentName: string,
    message: string,
    yearLabel: string | undefined,
    portrait: HTMLImageElement | null,
    crest: HTMLImageElement | null,
) {
    const canvas = document.createElement('canvas');
    const size = 1080;
    const center = size / 2;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');

    const background = context.createLinearGradient(0, 0, size, size);
    background.addColorStop(0, '#242c19');
    background.addColorStop(0.5, '#0b3027');
    background.addColorStop(1, '#041411');
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);

    const glow = context.createRadialGradient(center, 391, 70, center, 391, 475);
    glow.addColorStop(0, '#b98d3b68');
    glow.addColorStop(1, '#b98d3b00');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    context.strokeStyle = '#d8b46a';
    context.lineWidth = 2;
    context.strokeRect(37, 37, size - 74, size - 74);
    context.globalAlpha = 0.35;
    context.strokeRect(48, 48, size - 96, size - 96);
    context.globalAlpha = 1;

    if (crest?.naturalWidth) {
        context.fillStyle = '#fff9e9';
        context.beginPath();
        context.arc(center, 132, 45, 0, Math.PI * 2);
        context.fill();
        context.drawImage(crest, center - 35, 97, 70, 70);
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#fff6de';
    context.font = '700 30px "DM Sans", sans-serif';
    context.fillText(universityName, center, 211, 850);

    const portraitY = 428;
    for (const [radius, color, width] of [
        [153, '#e5c58444', 2],
        [132, '#e5c58488', 2],
        [108, '#e8c776', 7],
    ] as const) {
        context.strokeStyle = color;
        context.lineWidth = width;
        context.beginPath();
        context.arc(center, portraitY, radius, 0, Math.PI * 2);
        context.stroke();
    }

    for (let index = 0; index < 24; index += 1) {
        const angle = index * 2.39996;
        const radius = 170 + (index % 7) * 34;
        const x = center + Math.cos(angle) * radius;
        const y = portraitY + Math.sin(angle) * radius * 0.48;
        const length = index % 4 === 0 ? 9 : 4;
        context.save();
        context.translate(x, y);
        context.rotate(Math.PI / 4);
        context.fillStyle = index % 4 === 0 ? '#ffe5aa' : '#e2bd75a0';
        context.fillRect(-length / 2, -length / 2, length, length);
        context.restore();
    }

    if (portrait?.naturalWidth) {
        drawPortrait(context, portrait, center, portraitY, 100);
    } else {
        context.fillStyle = '#172c20';
        context.beginPath();
        context.arc(center, portraitY, 100, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe4a1';
        context.font = '700 54px "DM Sans", sans-serif';
        context.fillText(initialsFor(studentName), center, portraitY + 3, 175);
    }

    context.fillStyle = '#e9c878';
    context.font = '700 29px "DM Sans", sans-serif';
    context.fillText('FÉLICITATIONS', center, 646);

    if (studentName) {
        context.fillStyle = '#fff1c8';
        let fontSize = 77;
        context.font = `${fontSize}px "Libre Caslon Display", Georgia, serif`;
        while (context.measureText(studentName).width > 870 && fontSize > 35) {
            fontSize -= 2;
            context.font = `${fontSize}px "Libre Caslon Display", Georgia, serif`;
        }
        context.fillText(studentName, center, 731, 870);
    }

    context.fillStyle = '#f8f3e6';
    context.font = '500 35px "DM Sans", sans-serif';
    context.fillText(message, center, 828, 900);
    if (yearLabel) {
        context.fillStyle = '#dec994';
        context.font = '600 28px "DM Sans", sans-serif';
        context.fillText(yearLabel, center, 909, 900);
    }

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((image) => (image ? resolve(image) : reject(new Error('PNG is unavailable'))), 'image/png');
    });
}

export default function StudentResultCelebration({ studentName, semesterLabel, yearLabel, facultyName, photoUrl, onViewResults }: CelebrationProps) {
    const titleId = useId();
    const name = studentName.trim();
    const portrait = useRef<HTMLImageElement>(null);
    const crest = useRef<HTMLImageElement>(null);
    const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
    const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'failed'>('idle');
    // The student portrait is served by the authenticated portal.
    const localPhoto = photoUrl && /^\/(?![\\/])/.test(photoUrl) ? photoUrl : null;
    const message = `Vous avez réussi le ${semesterLabel.trim().toLocaleLowerCase('fr')}.`;

    async function downloadCelebration() {
        setDownloadState('working');
        try {
            const [portraitImage, crestImage] = await Promise.all([readyImage(portrait.current), readyImage(crest.current)]);
            const image = await createCelebrationImage(name, message, yearLabel, portraitImage, crestImage);
            const url = URL.createObjectURL(image);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'USK-photo-de-celebration.png';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setDownloadState('idle');
        } catch {
            setDownloadState('failed');
        }
    }

    return (
        <section className="student-result-celebration" aria-labelledby={titleId}>
            <div className="result-celebration-brand">
                <img ref={crest} src={crestUrl} width={54} height={54} alt="" />
                <div>
                    <strong>{universityName}</strong>
                    {facultyName && <span>{facultyName}</span>}
                </div>
            </div>
            <div className="result-celebration-medal" aria-hidden="true">
                <div className="result-celebration-confetti">
                    {confetti.map((style, index) => (
                        <i key={index} style={style} />
                    ))}
                </div>
                <Sparkles className="result-celebration-star" size={23} />
                <Sparkles className="result-celebration-star result-celebration-star-right" size={17} />
                <div className="result-celebration-portrait">
                    {localPhoto && localPhoto !== failedPhoto ? (
                        <img ref={portrait} src={localPhoto} alt="" crossOrigin="anonymous" onError={() => setFailedPhoto(localPhoto)} />
                    ) : (
                        <span>{initialsFor(name)}</span>
                    )}
                </div>
                <div className="result-celebration-seal">
                    <GraduationCap size={22} />
                </div>
            </div>
            <h2 id={titleId} className="result-celebration-title">
                <span>Félicitations{name ? '' : ' !'}</span>
                {name && <strong>{name} !</strong>}
            </h2>
            <p className="result-celebration-message">{message}</p>
            {yearLabel && <p className="result-celebration-year">{yearLabel}</p>}
            <div className="result-celebration-actions">
                <button className="result-celebration-primary" type="button" onClick={onViewResults}>
                    Voir mes résultats <ArrowRight size={19} aria-hidden="true" />
                </button>
                <button
                    className="result-celebration-download"
                    type="button"
                    disabled={downloadState === 'working'}
                    onClick={() => void downloadCelebration()}
                >
                    <Download size={19} aria-hidden="true" /> {downloadState === 'working' ? 'Préparation de la photo…' : 'Télécharger ma photo'}
                </button>
            </div>
            {downloadState === 'failed' && (
                <p className="result-celebration-error" role="alert">
                    Le téléchargement a échoué. Réessayez.
                </p>
            )}
        </section>
    );
}
