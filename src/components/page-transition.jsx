import { motion, useReducedMotion } from 'framer-motion'

// Opacity-only: avoids the CSS transform "containing block" bug where
// position:fixed inside a transformed ancestor snaps to content-bottom
// instead of the viewport. Opacity does not affect fixed positioning.
const enterV = { duration: 0.25, ease: 'easeOut' }
const exitV  = { duration: 0.15, ease: 'easeIn'  }

const variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: enterV },
  exit:    { opacity: 0, transition: exitV  },
}

const reducedV = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit:    { opacity: 0, transition: { duration: 0.1 } },
}

export function PageTransition({ children, className = '' }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      variants={reduce ? reducedV : variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  )
}
