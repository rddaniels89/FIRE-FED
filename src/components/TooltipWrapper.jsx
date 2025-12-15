function TooltipWrapper({ children, text }) {
  return (
    <div className="tooltip-trigger relative">
      {children}
      <div className="tooltip bottom-full left-0 mb-3 w-64" role="tooltip">
        {text}
      </div>
    </div>
  );
}

export default TooltipWrapper;


