import s from './Skeleton.module.css';

const Skeleton = ({ width, height, borderRadius, circle, className, style, count = 1 }) => {
  const elements = Array.from({ length: count });

  return (
    <>
      {elements.map((_, i) => (
        <div
          key={i}
          className={`${s.skeleton} ${className || ''}`}
          style={{
            width: width || '100%',
            height: height || '1em',
            borderRadius: circle ? '50%' : (borderRadius || 'var(--r-md)'),
            ...style
          }}
        />
      ))}
    </>
  );
};

export default Skeleton;
