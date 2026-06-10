import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { Booking } from "@/entities/Booking";
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

const TIME_SLOTS_WEEKDAY = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];

const TIME_SLOTS_SUNDAY = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
];

const formatTimeTo12Hour = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
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
  onReload
}) {
  const isSunday = new Date(date).getDay() === 0;
  const TIME_SLOTS = isSunday ? TIME_SLOTS_SUNDAY : TIME_SLOTS_WEEKDAY;

  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [currentTimePosition, setCurrentTimePosition] = useState(null);

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
      const maxHour = isSunday ? 22 : 23;
      if (hours >= 9 && hours < maxHour) {
        const totalMinutes = (hours - 9) * 60 + minutes;
        setCurrentTimePosition(totalMinutes);
      } else {
        setCurrentTimePosition(null);
      }
    };

    updateTimePosition();
    const interval = setInterval(updateTimePosition, 60000);
    return () => clearInterval(interval);
  }, [isSunday]);

  const sortedSimulators = [...simulators].sort((a, b) => {
    return getBaySortOrder(a.name) - getBaySortOrder(b.name);
  });

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

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const bookingId = result.draggableId;
    const destinationId = result.destination.droppableId;

    const parts = destinationId.split('-slot-');
    if (parts.length !== 2) return;

    const newBayId = parts[0].replace('bay-', '');
    const newTimeSlot = parts[1];

    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const newBay = simulators.find(s => s.id === newBayId);
    if (!newBay) return;

    const newEndTime = calculateEndTime(newTimeSlot, booking.duration_hours);

    if (hasConflict(newBayId, newTimeSlot, newEndTime, bookings, bookingId)) {
      alert("This time slot conflicts with an existing booking. Please choose a different time.");
      return;
    }

    setPendingMove({
      bookingId,
      booking,
      newBayId,
      newBayName: newBay.name,
      newStartTime: newTimeSlot
    });
    setShowMoveConfirm(true);
  };

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
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <DragDropContext onDragEnd={handleDragEnd}>
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

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 p-2 font-semibold text-xs border-r border-b bg-slate-50 text-left min-w-[80px]">
                      Bay
                    </th>
                    {TIME_SLOTS.map(time => (
                      <th key={time} className="p-2 text-center font-semibold text-xs bg-slate-50 border-r border-b min-w-[60px]">
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
                          <div className="flex">
                            {TIME_SLOTS.map((timeSlot) => {
                              const [slotHour] = timeSlot.split(':').map(Number);
                              const halfHourSlots = generateHalfHourSlots(slotHour);

                              return (
                                <div key={timeSlot} className="flex" style={{ width: '60px', minWidth: '60px' }}>
                                  {halfHourSlots.map((halfSlot, index) => {
                                    if (renderedSlots.has(halfSlot)) {
                                      return null;
                                    }

                                    const booking = getBookingForBayAndTime(bay.id, halfSlot);
                                    const block = getBlockForBayAndTime(bay.id, halfSlot);
                                    const [hour, minute] = halfSlot.split(':');
                                    const isHourMark = minute === '00';

                                    if (booking && isBookingStart(booking, halfSlot)) {
                                      const span = getBookingSpan(booking);
                                      const { first, last } = getFirstAndLastName(booking.customer_name);
                                      const dropId = `bay-${bay.id}-slot-${halfSlot}`;

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

                                      return (
                                        <Droppable key={dropId} droppableId={dropId} direction="horizontal">
                                          {(provided) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.droppableProps}
                                              style={{ width: `${span * 60}px`, minWidth: `${span * 60}px`, position: 'relative' }}
                                              className={isHourMark ? 'border-l-2 border-l-slate-400' : ''}
                                            >
                                              <Draggable draggableId={booking.id} index={0}>
                                                {(provided, snapshot) => (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    className={`absolute inset-0 border-r border-b cursor-move ${
                                                      snapshot.isDragging ? 'z-50 opacity-80 shadow-2xl' : ''
                                                    }`}
                                                    onClick={() => onBookingClick(booking)}
                                                  >
                                                    <div className="absolute inset-0 bg-yellow-400 text-slate-900 p-2 overflow-hidden flex flex-col justify-center border-l-4 border-yellow-600 hover:bg-yellow-500 transition-colors">
                                                      <div className="text-[11px] font-bold truncate">{first} {last}</div>
                                                      <div className="text-[10px] opacity-80 truncate">{booking.customer_phone}</div>
                                                      <div className="flex items-center gap-1 mt-0.5">
                                                        <Users className="w-3 h-3" />
                                                        <span className="text-[9px]">{booking.number_of_players || 1}</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </Draggable>
                                              {provided.placeholder}
                                            </div>
                                          )}
                                        </Droppable>
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
                                            width: `${span * 60}px`,
                                            minWidth: `${span * 60}px`
                                          }}
                                        >
                                          <div className="absolute inset-0 bg-slate-400 text-white p-2 overflow-hidden flex flex-col justify-center">
                                            <div className="text-[10px] font-semibold uppercase">{block.reason}</div>
                                            {block.notes && (
                                              <div className="text-[9px] opacity-90 truncate">{block.notes}</div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }

                                    const dropId = `bay-${bay.id}-slot-${halfSlot}`;

                                    return (
                                      <Droppable key={dropId} droppableId={dropId} direction="horizontal">
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={`border-r border-b min-h-[60px] hover:bg-emerald-50 cursor-pointer relative group transition-colors ${
                                              snapshot.isDraggingOver ? 'bg-emerald-100' : ''
                                            } ${isHourMark ? 'border-l-2 border-l-slate-400' : 'border-l border-l-slate-300'}`}
                                            style={{ width: '30px', minWidth: '30px' }}
                                            onClick={() => onTimeSlotClick(bay, halfSlot)}
                                          >
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                              <span className="text-xs text-emerald-600 font-semibold">+</span>
                                            </div>
                                            {provided.placeholder}
                                          </div>
                                        )}
                                      </Droppable>
                                    );
                                  })}
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
          </DragDropContext>
        </CardContent>
      </Card>

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