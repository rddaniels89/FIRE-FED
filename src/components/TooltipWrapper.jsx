function TooltipWrapper({ children, text }) {
  return (
    <div className="tooltip-trigger relative">
      {children}
      <div className="tooltip -top-12 left-0 w-64">
        {text}
      </div>
    </div>
  );
}

export default TooltipWrapper;


