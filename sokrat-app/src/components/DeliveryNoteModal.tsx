"use client";

type OrderItem = {
  panel_id?: string;
  type?: string;
  dimensions?: string;
  weight_tons?: number;
  quantity?: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  manifestId: string;
  driverName?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  vehicleTrailerType?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  inspectorName?: string | null;
  inspectorPhone?: string | null;
  orderDetails: OrderItem[];
  assignedAt?: string | null;
  factory?: string | null;
};

export default function DeliveryNoteModal({
  isOpen,
  onClose,
  manifestId,
  driverName,
  driverPhone,
  vehiclePlate,
  vehicleTrailerType,
  siteName,
  siteAddress,
  inspectorName,
  inspectorPhone,
  orderDetails,
  assignedAt,
  factory,
}: Props) {
  if (!isOpen) return null;

  const totalPanels = orderDetails.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0
  );
  const totalWeight = orderDetails.reduce(
    (sum, item) => sum + (item.weight_tons || 0) * (item.quantity || 0),
    0
  );

  const formatDate = (timestamp: string | null | undefined) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
      <div className="bg-white text-slate-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl">
        {/* Header bar with close + print */}
        <div className="sticky top-0 bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between z-10">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Delivery Note Preview
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded font-bold uppercase transition"
            >
              🖨️ Print
            </button>
            <button
              onClick={onClose}
              className="text-xs bg-slate-300 hover:bg-slate-400 text-slate-800 px-3 py-1 rounded font-bold uppercase transition"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Document content */}
        <div className="p-8 space-y-6">
          {/* Company header */}
          <div className="border-b-4 border-slate-900 pb-4 text-center">
            <h1 className="text-2xl font-black tracking-wider text-slate-900">
              GULF PRECAST LLC
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Industrial City of Abu Dhabi (ICAD), UAE
            </p>
            <h2 className="text-lg font-bold mt-3 text-slate-800 tracking-wide">
              DELIVERY NOTE
            </h2>
          </div>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 uppercase text-xs font-bold block">
                DN Number
              </span>
              <span className="font-mono font-bold text-slate-900">
                DN-{manifestId}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 uppercase text-xs font-bold block">
                Date Issued
              </span>
              <span className="font-mono text-slate-900">
                {formatDate(assignedAt)}
              </span>
            </div>
          </div>

          {/* From/To */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-300 rounded p-3">
              <span className="text-slate-500 uppercase text-xs font-bold block mb-1">
                From
              </span>
              <div className="text-slate-900 font-bold">
                {factory || "ICAD Factory"}
              </div>
              <div className="text-xs text-slate-600">
                Industrial City of Abu Dhabi
              </div>
            </div>
            <div className="border border-slate-300 rounded p-3">
              <span className="text-slate-500 uppercase text-xs font-bold block mb-1">
                Deliver To
              </span>
              <div className="text-slate-900 font-bold">
                {siteName || "Project Site"}
              </div>
              <div className="text-xs text-slate-600">
                {siteAddress || "Abu Dhabi, UAE"}
              </div>
            </div>
          </div>

          {/* Driver/Vehicle */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 uppercase text-xs font-bold block">
                Vehicle
              </span>
              <span className="text-slate-900 font-mono font-bold">
                {vehiclePlate || "—"}
              </span>
              {vehicleTrailerType && (
                <span className="text-slate-600 ml-2">
                  ({vehicleTrailerType})
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500 uppercase text-xs font-bold block">
                Driver
              </span>
              <span className="text-slate-900 font-bold">
                {driverName || "—"}
              </span>
              {driverPhone && (
                <div className="text-xs text-slate-600 font-mono">
                  {driverPhone}
                </div>
              )}
            </div>
          </div>

          {/* Inspector */}
          {inspectorName && (
            <div className="text-sm">
              <span className="text-slate-500 uppercase text-xs font-bold block">
                Site Inspector
              </span>
              <span className="text-slate-900 font-bold">
                {inspectorName}
              </span>
              {inspectorPhone && (
                <span className="text-slate-600 font-mono ml-2 text-xs">
                  {inspectorPhone}
                </span>
              )}
            </div>
          )}

          {/* Order details table */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2 border-b-2 border-slate-900 pb-1">
              Order Details
            </h3>
            <table className="w-full text-xs border border-slate-300">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-2 py-1 text-left font-bold">
                    #
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left font-bold">
                    Panel ID
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left font-bold">
                    Type
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left font-bold">
                    Dimensions
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-right font-bold">
                    Weight
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-right font-bold">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderDetails.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-slate-300 px-2 py-3 text-center text-slate-500 italic"
                    >
                      No panel details available
                    </td>
                  </tr>
                ) : (
                  orderDetails.map((item, idx) => (
                    <tr key={idx} className="even:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-mono">
                        {item.panel_id || "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        {item.type || "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-mono">
                        {item.dimensions || "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {item.weight_tons
                          ? `${item.weight_tons.toFixed(2)}T`
                          : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-bold">
                        {item.quantity || 1}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100">
                <tr>
                  <td
                    colSpan={4}
                    className="border border-slate-300 px-2 py-1 text-right font-bold uppercase"
                  >
                    Total
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold">
                    {totalWeight.toFixed(2)}T
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-bold">
                    {totalPanels}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures */}
          <div className="pt-6 border-t-2 border-slate-300">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="border-t border-slate-900 pt-1 mt-8">
                  <span className="font-bold uppercase text-slate-700">
                    Dispatcher
                  </span>
                </div>
              </div>
              <div>
                <div className="border-t border-slate-900 pt-1 mt-8">
                  <span className="font-bold uppercase text-slate-700">
                    Driver
                  </span>
                </div>
              </div>
              <div>
                <div className="border-t border-slate-900 pt-1 mt-8">
                  <span className="font-bold uppercase text-slate-700">
                    Site Inspector
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-300">
            This is a computer-generated document from S.O.K.R.A.T. System
          </div>
        </div>
      </div>
    </div>
  );
}