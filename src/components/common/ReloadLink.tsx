import { useNavigate } from 'react-router-dom';
import { MouseEvent, ReactNode } from 'react';

interface ReloadLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
  'data-testid'?: string;
}

/**
 * Custom Link component that navigates and then forces a page reload
 * to ensure fresh data and clean state on every navigation
 */
const ReloadLink = ({ to, children, className, onClick, title, 'data-testid': testId }: ReloadLinkProps) => {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    // Call optional onClick handler first
    if (onClick) {
      onClick();
    }

    // Navigate to the target
    navigate(to);

    // Force reload after navigation
    setTimeout(() => {
      window.location.reload();
    }, 50);
  };

  return (
    <a
      href={to}
      onClick={handleClick}
      className={className}
      title={title}
      data-testid={testId}
    >
      {children}
    </a>
  );
};

export default ReloadLink;
