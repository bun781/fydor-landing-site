"use client";

import { useEffect, useState } from "react";

const screenshots = [
  { src: "/frontpage-previews/review.png", alt: "Fydor's sentence review workspace", label: "Review" },
  { src: "/frontpage-previews/reading.png", alt: "Fydor's lesson reading workspace", label: "Reading" },
  { src: "/frontpage-previews/study.png", alt: "Fydor's study mode workspace", label: "Study" },
  { src: "/frontpage-previews/lesson-builder.png", alt: "Fydor's lesson builder workspace", label: "Lesson builder" },
];

export function FrontpageScreenshotCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % screenshots.length), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <figure className="screenshot-carousel" aria-label="Real screenshots of the Fydor desktop app">
      <div className="screenshot-frame">
        {screenshots.map((screenshot, index) => (
          <img className={index === active ? "is-active" : ""} key={screenshot.src} src={screenshot.src} alt={screenshot.alt} />
        ))}
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
