import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardRoot.displayName = 'Card';

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Cabeçalho livre do Card: `<Card.Header>...</Card.Header>`
 */
const CardSection: React.FC<CardSectionProps> = ({ className, children, ...props }) => (
  <div
    className={clsx('border-b border-gray-200 pb-4 dark:border-gray-700', className)}
    {...props}
  >
    {children}
  </div>
);

CardSection.displayName = 'Card.Header';

export const Card = Object.assign(CardRoot, { Header: CardSection });

interface CardHeaderProps {
  title: string;
  description?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
  </div>
);

CardHeader.displayName = 'CardHeader';
