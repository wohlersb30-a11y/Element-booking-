import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Lock, Crown, Tag } from "lucide-react";
import { Booking } from "@/entities/Booking";
import { BOOKING_CATEGORIES, categoryStyle } from "@/lib/bookingCategories";
import { useLocationHours, toMinutes, closeTimeForDate } from "@/config/hours";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Build the hourly column labels for the grid, from the location's open hour
// through its closing-boundary hour (inclusive), e.g. 09:00…23:00.
const buildHourColumns = (openTime, closeTime) => {
  const startHour = Math.floor(toMinutes(openTime) / 60);
  const endHour = Math.floor(toMinutes(closeTime) / 60);
  const out = [];
  for (let h = startHour; h <= endHour; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
};

// Width (px) of one hour column. Half-hour cells and booking spans derive
// from this so the header, body, and "now" line always stay aligned.
const HOUR_WIDTH = 80;
const HALF_WIDTH = HOUR_WIDTH / 2;

const formatTimeTo12Hour = (time24) => {
  const [rawHours, minutes] = time24.split(':').map(Number);
  const hours = rawHours % 24; // 24:00 (midnight) -> 0
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const minStr = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';
  return `${hours12}${minStr}${period}`;
};

const getBayDisplayName = (originalName) => {
  const nameMap = {
    "East 1": "Bay 1",
    "East 2": "Bay 2",
    "West 1": "Bay 3",
    "West 2": "Bay 4",
    "West 3": "Bay 5",
    "South 1": "Bay 6",
    "South 2": "Bay 7",
    "North 1": "Bay 8",
    "North 2": "Bay 9",
    "Bay 1": "Bay 1",
    "Bay 2": "Bay 2",
    "Bay 3": "Bay 3",
    "Bay 4": "Bay 4",
    "Bay 5": "Bay 5",
    "Bay 6": "Bay 6",
    "Bay 7": "Bay 7",
    "Bay 8": "Bay 8",
    "Bay 9": "Bay 9",
    "Bay 10": "Bay 10",
    "VIP 1": "VIP 1",
    "VIP 2": "VIP 2"
  };
  return nameMap[originalName] || originalName;
};

const getBaySortOrder = (originalName) => {
  const orderMap = {
    "East 1": 1,
    "East 2": 2,
    "West 1": 3,
    "West 2": 4,
    "West 3": 5,
    "South 1": 6,
    "South 2": 7,
    "North 1": 8,
    "North 2": 9,
    "Bay 1": 1,
    "Bay 2": 2,
    "Bay 3": 3,
    "Bay 4": 4,
    "Bay 5": 5,
    "Bay 6": 6,
    "Bay 7": 7,
    "Bay 8": 8,
    "Bay 9": 9,
    "Bay 10": 10,
    "VIP 1": 11,
    "VIP 2": 12
  };
  return orderMap[originalName] || 999;
};

const OVERRIDE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a 'yyyy-MM-dd' string as e.g. "Dec 25" for the override banner.
const formatYMDLabel = (ymd) => {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split('-').map(Number);
  return `${OVERRIDE_MONTHS[(m || 1) - 1]} ${d}`;
};

// Whether a Date falls within a ['yyyy-MM-dd', 'yyyy-MM-dd'] range, compared at
// local date granularity (no time component, no UTC shift).
const dateInRange = (viewDate, startStr, endStr) => {
  if (!viewDate || !startStr || !endStr) return false;
  const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const s = new Date(sy, (sm || 1) - 1, sd || 1);
  const e = new Date(ey, (em || 1) - 1, ed || 1);
  return d >= s && d <= e;
};

const calculateEndTime = (startTime, durationHours) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (durationHours * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

const hasConflict = (bayId, startTime, endTime, bookings, currentBookingId = null) => {
  const [newStartHour, newStartMin] = startTime.split(':').map(Number);
  const [newEndHour, newEndMin] = endTime.split(':').map(Number);
  const newStartMins = newStartHour * 60 + newStartMin;
  const newEndMins = newEndHour * 60 + newEndMin;

  return bookings.some(booking => {
    if (booking.simulator_id !== bayId) return false;
    if (booking.id === currentBookingId) return false;
    if (booking.status === 'cancelled') return false;

    const [bookingStartHour, bookingStartMin] = booking.start_time.split(':').map(Number);
    const [bookingEndHour, bookingEndMin] = booking.end_time.split(':').map(Number);
    const bookingStartMins = bookingStartHour * 60 + bookingStartMin;
    const bookingEndMins = bookingEndHour * 60 + bookingEndMin;

    return (newStartMins < bookingEndMins && newEndMins > bookingStartMins);
  });
};

export default function DailyScheduleView({
  date,
  bookings,
  simulators,
  blocks = [],
  onBookingClick,
  onTimeSlotClick,
  onBlockClick,
  onReload
}) {
  // Grid columns follow the location's operating hours (defaults to 9 AM–11 PM,
  // earlier close on Sundays). Derive the location from the bays being shown.
  const scheduleLocation = simulators?.[0]?.location;
  const hours = useLocationHours(scheduleLocation);
  const openTime = hours.open;
  const closeTime = closeTimeForDate(date, hours);
  const startHour = Math.floor(toMinutes(openTime) / 60);
  const endHour = Math.floor(toMinutes(closeTime) / 60);
  const TIME_SLOTS = buildHourColumns(openTime, closeTime);

  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [currentTimePosition, setCurrentTimePosition] = useState(null);

  // Custom pointer-based drag for moving reservations. The previous
  // @hello-pangea/dnd implementation used the narrow 40px half-hour cells as
  // drop targets, so its center-based collision detection made nudging a
  // reservation 30 minutes forward/back very finicky. Here we snap the move to
  // exact 30-minute steps from the horizontal pointer delta (1 slot = HALF_WIDTH
  // px) and read the target bay from whatever row is under the cursor, which is
  // precise and predictable. dragRef holds the live, mutable drag; dragUI mirrors
  // it into state only for rendering the floating badge + block styling.
  const dragRef = useRef(null);
  const [dragUI, setDragUI] = useState(null);

  useEffect(() => {
    const updateTimePosition = () => {
      const now = new Date();
      const cstTimeString = now.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      const [hours, minutes] = cstTimeString.split(':').map(Number);
      if (hours >= startHour && hours < endHour) {
        const totalMinutes = (hours - startHour) * 60 + minutes;
        setCurrentTimePosition(totalMinutes * (HOUR_WIDTH / 60));
      } else {
        setCurrentTimePosition(null);
      }
    };

    updateTimePosition();
    const interval = setInterval(updateTimePosition, 60000);
    return () => clearInterval(interval);
  }, [startHour, endHour]);

  const sortedSimulators = useMemo(
    () => [...simulators].sort((a, b) => getBaySortOrder(a.name) - getBaySortOrder(b.name)),
    [simulators]
  );

  // Date-range price overrides that are active on the currently-viewed day.
  // Rules are stored per-simulator (see the pricing_rules table); here we
  // regroup the matching ones by label + date span and split their rates back
  // into Regular vs VIP so staff can see, at a glance, exactly what a customer
  // will be charged for this date.
  const priceOverrides = useMemo(() => {
    const groups = {};
    for (const bay of sortedSimulators) {
      const isVIP = bay.bay_type === "vip";
      for (const rule of bay.pricing_rules || []) {
        if (!dateInRange(date, rule.start_date, rule.end_date)) continue;
        const key = `${rule.name || ""}|${rule.start_date}|${rule.end_date}`;
        const g = groups[key] || (groups[key] = {
          label: rule.name || "Custom pricing",
          start_date: rule.start_date,
          end_date: rule.end_date,
          std_off: null,
          std_peak: null,
          vip_off: null,
          vip_peak: null
        });
        if (isVIP) {
          g.vip_off = rule.off_peak_rate;
          g.vip_peak = rule.peak_rate;
        } else {
          g.std_off = rule.off_peak_rate;
          g.std_peak = rule.peak_rate;
        }
      }
    }
    return Object.values(groups);
  }, [sortedSimulators, date]);

  const getBookingForBayAndTime = (bayId, timeSlot) => {
    return bookings.find(booking => {
      if (booking.simulator_id !== bayId) return false;
      if (booking.status === 'cancelled') return false;

      const [bookingHour, bookingMin] = booking.start_time.split(':').map(Number);
      const [slotHour, slotMin] = timeSlot.split(':').map(Number);
      const bookingStartMins = bookingHour * 60 + bookingMin;
      const slotStartMins = slotHour * 60 + slotMin;

      return slotStartMins === bookingStartMins;
    });
  };

  const getBlockForBayAndTime = (bayId, timeSlot) => {
    return blocks.find(block => {
      if (block.simulator_id !== bayId) return false;

      const [blockHour, blockMin] = block.start_time.split(':').map(Number);
      const [slotHour, slotMin] = timeSlot.split(':').map(Number);
      const blockStartMins = blockHour * 60 + blockMin;
      const slotStartMins = slotHour * 60 + slotMin;

      return slotStartMins === blockStartMins;
    });
  };

  const getBookingSpan = (booking) => {
    return booking.duration_hours;
  };

  const getBlockSpan = (block) => {
    const [startHour, startMin] = block.start_time.split(':').map(Number);
    const [endHour, endMin] = block.end_time.split(':').map(Number);
    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;
    return (endTotalMinutes - startTotalMinutes) / 60;
  };

  // Start dragging a reservation block. Everything is tracked in dragRef and we
  // only commit on pointer-up, so a plain click (no time/bay change) still opens
  // the booking modal.
  const beginDrag = (e, booking) => {
    if (e.button != null && e.button !== 0) return; // primary button / touch only
    e.preventDefault();
    dragRef.current = {
      booking,
      startX: e.clientX,
      startBayId: booking.simulator_id,
      curStart: booking.start_time,
      curEnd: booking.end_time,
      curBayId: booking.simulator_id,
      curBayName: booking.simulator_name,
      curX: e.clientX,
      curY: e.clientY,
      valid: true,
      moved: false
    };
    setDragUI({ ...dragRef.current });
  };

  useEffect(() => {
    const openMin = startHour * 60;
    const closeMin = endHour * 60;

    const handleMove = (e) => {
      const d = dragRef.current;
      if (!d) return;

      // Snap the horizontal pointer delta to exact 30-minute steps.
      const offsetSlots = Math.round((e.clientX - d.startX) / HALF_WIDTH);
      const [oh, om] = d.booking.start_time.split(':').map(Number);
      const durMin = Math.round((d.booking.duration_hours || 1) * 60);
      let newStartMin = oh * 60 + om + offsetSlots * 30;
      // Keep the whole reservation within operating hours.
      if (newStartMin < openMin) newStartMin = openMin;
      if (newStartMin + durMin > closeMin) newStartMin = closeMin - durMin;
      const nh = Math.floor(newStartMin / 60);
      const nm = newStartMin % 60;
      const newStart = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      const newEnd = calculateEndTime(newStart, d.booking.duration_hours);

      // Target bay = whichever row the cursor is over (falls back to the origin).
      let targetBayId = d.startBayId;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const bayEl = el && el.closest ? el.closest('[data-bay-id]') : null;
      if (bayEl) targetBayId = bayEl.getAttribute('data-bay-id');
      const targetBay = sortedSimulators.find(s => s.id === targetBayId);

      const conflict = hasConflict(targetBayId, newStart, newEnd, bookings, d.booking.id);
      const moved = newStart !== d.booking.start_time || targetBayId !== d.startBayId;

      dragRef.current = {
        ...d,
        curStart: newStart,
        curEnd: newEnd,
        curBayId: targetBayId,
        curBayName: targetBay ? targetBay.name : '',
        curX: e.clientX,
        curY: e.clientY,
        valid: !!targetBay && !conflict,
        moved
      };
      setDragUI({ ...dragRef.current });
    };

    const handleUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragUI(null);
      if (!d) return;

      // No effective change -> treat as a click and open the booking modal.
      if (!d.moved) {
        onBookingClick(d.booking);
        return;
      }
      if (d.valid) {
        const targetBay = sortedSimulators.find(s => s.id === d.curBayId);
        if (targetBay) {
          setPendingMove({
            bookingId: d.booking.id,
            booking: d.booking,
            newBayId: targetBay.id,
            newBayName: targetBay.name,
            newStartTime: d.curStart
          });
          setShowMoveConfirm(true);
        }
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [bookings, sortedSimulators, startHour, endHour, onBookingClick]);

  const confirmMove = async () => {
    if (!pendingMove) return;

    const { bookingId, booking, newBayId, newBayName, newStartTime } = pendingMove;
    const newEndTime = calculateEndTime(newStartTime, booking.duration_hours);

    try {
      await Booking.update(bookingId, {
        simulator_id: newBayId,
        simulator_name: newBayName,
        start_time: newStartTime,
        end_time: newEndTime
      });
      setShowMoveConfirm(false);
      setPendingMove(null);
      if (onReload) {
        await onReload();
      }
    } catch (error) {
      console.error("Error moving booking:", error);
      alert("Failed to move booking. Please try again.");
      setShowMoveConfirm(false);
      setPendingMove(null);
    }
  };

  const cancelMove = () => {
    setShowMoveConfirm(false);
    setPendingMove(null);
  };

  const getFirstAndLastName = (fullName) => {
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts[parts.length - 1] };
  };

  const generateHalfHourSlots = (hour) => {
    return [
      `${hour.toString().padStart(2, '0')}:00`,
      `${hour.toString().padStart(2, '0')}:30`
    ];
  };

  const isBookingStart = (booking, slotTime) => {
    const [bookingHour, bookingMin] = booking.start_time.split(':').map(Number);
    const [slotHour, slotMin] = slotTime.split(':').map(Number);
    return bookingHour === slotHour && bookingMin === slotMin;
  };

  const isBlockStart = (block, slotTime) => {
    const [blockHour, blockMin] = block.start_time.split(':').map(Number);
    const [slotHour, slotMin] = slotTime.split(':').map(Number);
    return blockHour === slotHour && blockMin === slotMin;
  };

  return (
    <>
      <Card className="bg-white">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">Daily Schedule</CardTitle>
          {/* Color key — always visible so staff can read the schedule at a glance. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
            {BOOKING_CATEGORIES.map((cat) => (
              <div key={cat.key} className="flex items-center gap-1.5">
                <span className={`inline-block w-3 h-3 rounded-sm ${cat.dot}`} />
                <span className="text-xs text-slate-600">{cat.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-slate-400" />
              <span className="text-xs text-slate-600">Blocked</span>
            </div>
          </div>

          {/* Price-override indicator: shows any date-range pricing that is
              active for the day currently on screen, so staff can confirm what
              customers are being charged. */}
          {priceOverrides.length > 0 && (
            <div className="mt-3 space-y-2">
              {priceOverrides.map((o, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] uppercase tracking-wide">
                    <Tag className="w-3.5 h-3.5" />
                    Price override active
                  </div>
                  <span className="text-sm font-bold text-amber-900">{o.label}</span>
                  <span className="text-xs text-amber-700">
                    {formatYMDLabel(o.start_date)} – {formatYMDLabel(o.end_date)}
                  </span>
                  <span className="text-xs text-amber-900 font-medium">
                    {o.std_off != null && (
                      <span>Regular ${o.std_off}/${o.std_peak}<span className="text-amber-700 font-normal"> (off/peak)</span></span>
                    )}
                    {o.std_off != null && o.vip_off != null && <span className="mx-1">·</span>}
                    {o.vip_off != null && (
                      <span>VIP ${o.vip_off}/${o.vip_peak}<span className="text-amber-700 font-normal"> (off/peak)</span></span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
            <div className="relative">
              {currentTimePosition !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                  style={{
                    left: `calc(80px + ${currentTimePosition}px)`
                  }}
                >
                  <div className="absolute top-0 -left-2 w-4 h-4 bg-red-500 rounded-full" />
                </div>
              )}

              <table className="border-collapse" style={{ width: 'max-content' }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 p-2 font-semibold text-xs border-r border-b bg-slate-50 text-left min-w-[80px]">
                      Bay
                    </th>
                    {TIME_SLOTS.map(time => (
                      <th key={time} className="p-2 text-center font-semibold text-xs bg-slate-50 border-r border-b" style={{ width: `${HOUR_WIDTH}px`, minWidth: `${HOUR_WIDTH}px` }}>
                        {formatTimeTo12Hour(time)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSimulators.map(bay => {
                    const renderedSlots = new Set();

                    return (
                      <tr key={bay.id}>
                        <td className="sticky left-0 z-10 p-2 font-medium text-xs border-r border-b bg-white">
                          <div className="flex items-center justify-between">
                            <span>{getBayDisplayName(bay.name)}</span>
                            {bay.bay_type === "vip" && (
                              <Badge className="bg-amber-100 text-amber-800 text-[9px] px-1">VIP</Badge>
                            )}
                          </div>
                        </td>
                        <td colSpan={TIME_SLOTS.length} className="p-0 relative">
                          {/* Flat row of half-hour cells. Rendering every 30-min slot
                              in a single flex row (rather than nesting them inside a
                              fixed-width per-hour wrapper) keeps booking/block widths
                              perfectly aligned with the hourly header — even when a
                              reservation starts on a half hour or spans an hour
                              boundary — so the white cell right after a booking stays
                              clickable for manual bookings. */}
                          <div className="flex" data-bay-id={bay.id}>
                            {TIME_SLOTS.flatMap((timeSlot) => {
                              const [slotHour] = timeSlot.split(':').map(Number);
                              return generateHalfHourSlots(slotHour);
                            }).map((halfSlot) => {
                                    if (renderedSlots.has(halfSlot)) {
                                      return null;
                                    }

                                    const booking = getBookingForBayAndTime(bay.id, halfSlot);
                                    const block = getBlockForBayAndTime(bay.id, halfSlot);
                                    const [hour, minute] = halfSlot.split(':');
                                    const isHourMark = minute === '00';

                                    if (booking && isBookingStart(booking, halfSlot)) {
                                      const span = getBookingSpan(booking);
                                      const { first, last } = getFirstAndLastName(booking.customer_name || "");
                                      const dropId = `bay-${bay.id}-slot-${halfSlot}`;
                                      const cat = categoryStyle(booking);
                                      const isMember = booking.booking_type === 'member' || booking.is_member;

                                      const [startHour, startMin] = booking.start_time.split(':').map(Number);
                                      const [endHour, endMin] = booking.end_time.split(':').map(Number);
                                      let currentMin = startHour * 60 + startMin;
                                      const endMin_total = endHour * 60 + endMin;
                                      while (currentMin < endMin_total) {
                                        const h = Math.floor(currentMin / 60);
                                        const m = currentMin % 60;
                                        renderedSlots.add(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
                                        currentMin += 30;
                                      }

                                      const blockInner = (
                                        <div className={`absolute inset-0 ${cat.block} p-2 overflow-hidden flex flex-col justify-center transition-colors border-l-4 ${booking.bay_locked ? 'border-emerald-600' : cat.border}`}>
                                          {isMember ? (
                                            <div className="absolute top-1 right-1 opacity-90" title="Member reservation">
                                              <Crown className="w-3 h-3" />
                                            </div>
                                          ) : booking.bay_locked ? (
                                            <div
                                              className="absolute top-1 right-1 text-emerald-100"
                                              title="Customer prefers this bay — the optimizer won't move it"
                                            >
                                              <Lock className="w-3 h-3" />
                                            </div>
                                          ) : null}
                                          <div className="text-[11px] font-bold truncate pr-3">{first} {last}</div>
                                          <div className="text-[10px] opacity-80 truncate">
                                            {isMember ? (booking.is_prime ? 'Prime member' : 'Included') : booking.customer_phone}
                                          </div>
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <Users className="w-3 h-3" />
                                            <span className="text-[9px]">{booking.number_of_players || 1}</span>
                                          </div>
                                        </div>
                                      );

                                      // Member reservations live in a different table and can't be
                                      // drag-moved via Booking.update, so render them as a static,
                                      // non-draggable block — still fully visible and color-coded.
                                      if (isMember) {
                                        return (
                                          <div
                                            key={dropId}
                                            style={{ width: `${span * HOUR_WIDTH}px`, minWidth: `${span * HOUR_WIDTH}px`, position: 'relative' }}
                                            className={`min-h-[60px] ${isHourMark ? 'border-l-2 border-l-slate-400' : ''}`}
                                          >
                                            <div className="absolute inset-0 border-r border-b">{blockInner}</div>
                                          </div>
                                        );
                                      }

                                      const isDraggingThis =
                                        dragUI && dragUI.moved && dragUI.booking.id === booking.id;

                                      return (
                                        <div
                                          key={dropId}
                                          style={{ width: `${span * HOUR_WIDTH}px`, minWidth: `${span * HOUR_WIDTH}px`, position: 'relative' }}
                                          className={isHourMark ? 'border-l-2 border-l-slate-400' : ''}
                                        >
                                          <div
                                            className={`absolute inset-0 border-r border-b cursor-move select-none ${
                                              isDraggingThis ? 'opacity-50 ring-2 ring-[#2d5567] z-40' : ''
                                            }`}
                                            style={{ touchAction: 'none' }}
                                            onPointerDown={(e) => beginDrag(e, booking)}
                                            title="Drag to move · click to edit"
                                          >
                                            {blockInner}
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (block && isBlockStart(block, halfSlot)) {
                                      const span = getBlockSpan(block);

                                      const [startHour, startMin] = block.start_time.split(':').map(Number);
                                      const [endHour, endMin] = block.end_time.split(':').map(Number);
                                      let currentMin = startHour * 60 + startMin;
                                      const endMin_total = endHour * 60 + endMin;
                                      while (currentMin < endMin_total) {
                                        const h = Math.floor(currentMin / 60);
                                        const m = currentMin % 60;
                                        renderedSlots.add(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
                                        currentMin += 30;
                                      }

                                      return (
                                        <div
                                          key={`block-${bay.id}-${halfSlot}`}
                                          className={`relative border-r border-b min-h-[60px] ${isHourMark ? 'border-l-2 border-l-slate-400' : ''}`}
                                          style={{
                                            width: `${span * HOUR_WIDTH}px`,
                                            minWidth: `${span * HOUR_WIDTH}px`
                                          }}
                                        >
                                          <div
                                            className={`absolute inset-0 bg-slate-400 text-white p-2 overflow-hidden flex flex-col justify-center ${onBlockClick ? 'cursor-pointer hover:bg-slate-500 transition-colors' : ''}`}
                                            onClick={onBlockClick ? () => onBlockClick(block) : undefined}
                                            title={onBlockClick ? "Click to edit or remove this block" : undefined}
                                          >
                                            <div className="text-[10px] font-semibold uppercase">{block.reason}</div>
                                            {block.notes && (
                                              <div className="text-[9px] opacity-90 truncate">{block.notes}</div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }

                                    const cellId = `bay-${bay.id}-slot-${halfSlot}`;

                                    return (
                                      <div
                                        key={cellId}
                                        className={`border-r border-b min-h-[60px] hover:bg-emerald-50 cursor-pointer relative group transition-colors ${isHourMark ? 'border-l-2 border-l-slate-400' : 'border-l border-l-slate-300'}`}
                                        style={{ width: `${HALF_WIDTH}px`, minWidth: `${HALF_WIDTH}px` }}
                                        onClick={() => onTimeSlotClick(bay, halfSlot)}
                                      >
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <span className="text-xs text-emerald-600 font-semibold">+</span>
                                        </div>
                                      </div>
                                    );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </CardContent>
      </Card>

      {/* Floating indicator that follows the cursor while dragging, showing the
          snapped target bay + time and whether the slot is available. */}
      {dragUI && dragUI.moved && (
        <div
          className="fixed z-[60] pointer-events-none px-2.5 py-1.5 rounded-md text-xs font-semibold shadow-lg text-white"
          style={{
            left: dragUI.curX + 14,
            top: dragUI.curY + 14,
            backgroundColor: dragUI.valid ? '#059669' : '#dc2626'
          }}
        >
          {getBayDisplayName(dragUI.curBayName || '')} · {formatTimeTo12Hour(dragUI.curStart)}–{formatTimeTo12Hour(dragUI.curEnd)}
          {!dragUI.valid && (
            <div className="text-[10px] font-normal opacity-90">Unavailable here</div>
          )}
        </div>
      )}

      <AlertDialog open={showMoveConfirm} onOpenChange={setShowMoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reservation Move</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove && (
                <>
                  Are you sure you want to move this reservation to{" "}
                  <strong>{getBayDisplayName(pendingMove.newBayName)}</strong> at{" "}
                  <strong>{formatTimeTo12Hour(pendingMove.newStartTime)}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelMove}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove} className="bg-[#2d5567] hover:bg-[#1e3a47]">
              Confirm Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}