'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  MotionConfig,
  useMotionValue,
  useTransform,
} from 'motion/react';

export const EASE_OUT_EXPO: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
];

export const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
  mass: 0.75,
};

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
    >
      {children}
    </MotionConfig>
  );
}

export function PageMotion({
  children,
  className = 'page-stack',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGrid({
  children,
  className,
  style,
  stagger = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerCard({
  children,
  className = 'card',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.38, ease: EASE_OUT_EXPO },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function SpotlightCard({
  children,
  className = 'card',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [spot, setSpot] = useState({ x: 0, y: 0, visible: false });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpot({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  }

  return (
    <motion.section
      ref={cardRef}
      className={`${className} spotlight-card`}
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setSpot((prev) => ({ ...prev, visible: false }))}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE_OUT_EXPO }}
    >
      <div
        aria-hidden="true"
        className="spotlight-layer"
        style={{
          opacity: spot.visible ? 1 : 0,
          background: `radial-gradient(360px circle at ${spot.x}px ${spot.y}px, rgba(29, 78, 216, 0.06), transparent 65%)`,
        }}
      />
      <div className="spotlight-content">{children}</div>
    </motion.section>
  );
}

export function AnimatedNumber({
  value,
  suffix = '',
}: {
  value: number;
  suffix?: string;
}) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (latest) => Math.round(latest));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsub = rounded.on('change', (v) => setDisplay(v));
    const controls = animate(motionVal, value, {
      duration: 0.65,
      ease: EASE_OUT_EXPO,
    });
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, motionVal, rounded]);

  return (
    <span className="tabular">
      {display}
      {suffix}
    </span>
  );
}

export function AnimatedProgressBar({
  percent,
  color,
  height = 10,
}: {
  percent: number;
  color: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{
        height,
        background: 'var(--bg-raised)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: 'left center',
          background: color,
        }}
      />
    </div>
  );
}
