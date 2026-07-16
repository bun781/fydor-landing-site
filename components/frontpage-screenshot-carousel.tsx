"use client";

import { useEffect, useState } from "react";
import frontpagePreview from "../frontpage-previews/frontpage preview.png";

const screenshots = [
  { src: frontpagePreview.src, alt: "Fydor desktop app frontpage preview", label: "Fydor" },
  { src: "/frontpage-previews/review.png", alt: "Fydor's sentence review workspace", label: "Review" },
  { src: "/frontpage-previews/lesson-builder.png", alt: "Fydor's lesson builder workspace", label: "Lesson builder" },
  { src: "/frontpage-previews/reading.png", alt: "Fydor's lesson reading workspace", label: "Reading" },
  { src: "/frontpage-previews/study.png", alt: "Fydor's study mode workspace", label: "Study" },
];

export function FrontpageScreenshotCarousel() {
  const [active, setActive] = useState(0);
  const showPrevious = () => setActive((current) => (current - 1 + screenshots.length) % screenshots.length);
  const showNext = () => setActive((current) => (current + 1) % screenshots.length);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % screenshots.length), 10000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <figure className="screenshot-carousel" aria-label="Real screenshots of the Fydor desktop app">
      <div className="screenshot-frame">
        {screenshots.map((screenshot, index) => (
          <img className={index === active ? "is-active" : ""} key={screenshot.src} src={screenshot.src} alt={screenshot.alt} />
        ))}
        <button className="screenshot-arrow previous" aria-label="Show previous screenshot" onClick={showPrevious} type="button">←</button>
        <button className="screenshot-arrow next" aria-label="Show next screenshot" onClick={showNext} type="button">→</button>
      </div>
      <figcaption>
        <span>Real Fydor desktop app screenshots</span>
        <div className="screenshot-controls" aria-label="Choose app screenshot">
          {screenshots.map((screenshot, index) => (
            <button aria-label={`Show ${screenshot.label} screenshot`} aria-pressed={index === active} key={screenshot.src} onClick={() => setActive(index)} type="button" />
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
