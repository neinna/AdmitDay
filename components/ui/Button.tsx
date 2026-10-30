import { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'outline'

export type ButtonSize = 'md' | 'sm'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  selected?: boolean
}

const BASE =
  'font-sans transition-colors duration-[120ms] ease-out inline-flex items-center justify-center leading-none disabled:opacity-50 disabled:cursor-not-allowed'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white font-medium border border-accent',
  outline: 'bg-transparent text-ink border border-ink',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'text-[15px] px-[26px] py-[13px]',
  sm: 'text-[12.5px] w-[68px] py-[5px]',
}

const SELECTED_CLASSES = 'bg-ink text-white border border-ink'

export default function Button({ variant = 'primary', size = 'md', selected = false, className = '', ...rest }: Props) {
  const variantClasses = selected ? SELECTED_CLASSES : VARIANT_CLASSES[variant]
  return <button className={`${BASE} ${SIZE_CLASSES[size]} ${variantClasses} ${className}`} {...rest} />
}
