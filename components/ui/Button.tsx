import { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'outline'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const BASE = 'font-sans text-[15px] px-[26px] py-[13px] transition-colors duration-[120ms] ease-out'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white font-medium border border-accent',
  outline: 'bg-transparent text-ink border border-ink',
}

export default function Button({ variant = 'primary', className = '', ...rest }: Props) {
  return <button className={`${BASE} ${VARIANT_CLASSES[variant]} ${className}`} {...rest} />
}
