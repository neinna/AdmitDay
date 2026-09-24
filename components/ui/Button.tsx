import { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'outline'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  selected?: boolean
}

const BASE =
  'font-sans text-[15px] px-[26px] py-[13px] transition-colors duration-[120ms] ease-out inline-flex items-center justify-center leading-none'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white font-medium border border-accent',
  outline: 'bg-transparent text-ink border border-ink',
}

const SELECTED_CLASSES = 'bg-ink text-white border border-ink'

export default function Button({ variant = 'primary', selected = false, className = '', ...rest }: Props) {
  const variantClasses = selected ? SELECTED_CLASSES : VARIANT_CLASSES[variant]
  return <button className={`${BASE} ${variantClasses} ${className}`} {...rest} />
}
