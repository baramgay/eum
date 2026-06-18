'use client'

import { motion, useReducedMotion, type MotionProps } from 'framer-motion'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type MotionOnlyProps =
  | 'initial'
  | 'animate'
  | 'exit'
  | 'transition'
  | 'whileHover'
  | 'whileTap'
  | 'layout'

interface DivProps extends ComponentPropsWithoutRef<'div'> {
  initial?: MotionProps['initial']
  animate?: MotionProps['animate']
  exit?: MotionProps['exit']
  transition?: MotionProps['transition']
  whileHover?: MotionProps['whileHover']
  whileTap?: MotionProps['whileTap']
  layout?: MotionProps['layout']
}

export function ReducedMotionDiv({ children, ...props }: DivProps) {
  const reduce = useReducedMotion()
  if (reduce) {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props
    return <div {...rest}>{children}</div>
  }
  return <motion.div {...props as unknown as ComponentPropsWithoutRef<typeof motion.div>}>{children}</motion.div>
}

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  initial?: MotionProps['initial']
  animate?: MotionProps['animate']
  exit?: MotionProps['exit']
  transition?: MotionProps['transition']
  whileHover?: MotionProps['whileHover']
  whileTap?: MotionProps['whileTap']
  layout?: MotionProps['layout']
}

export function ReducedMotionButton({ children, type = 'button', ...props }: ButtonProps) {
  const reduce = useReducedMotion()
  if (reduce) {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props
    return (
      <button type={type} {...rest}>
        {children}
      </button>
    )
  }
  return (
    <motion.button type={type} {...props as unknown as ComponentPropsWithoutRef<typeof motion.button>}>
      {children}
    </motion.button>
  )
}
