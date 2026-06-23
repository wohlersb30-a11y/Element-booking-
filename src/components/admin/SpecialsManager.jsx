import React, { useState, useEffect } from "react";
import { Special } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X, Plus, Loader2, Trash2, Pencil, Tag } from "lucide-react";

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
];

const DURATIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

const formatTimeLabel = (value) => {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
};

const locationLabel = (loc) =>
  loc === "vadnais_heights" ? "Vadnais Heights" : loc === "burnsville" ? "Burnsville" : "Both Locations";

const emptyForm = {
  title: "",
  description: "",
  includes: "",
  location: "vadnais_heights",
  price: "",
  duration_hours: 1,
  days_of_week: [],
  window_start: "09:00",
  window_end: "22:00",
  valid_from: "",
  valid_to: "",
  is_active: true
};

export default function SpecialsManager({ defaultLocation = "vadnais_heights", onClose }) {
  const [specials, setSpecials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, location: defaultLocation });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadSpecials();
  }, []);

  const loadSpecials = async () => {
    setIsLoading(true);
    try {
      const all = await Special.list("-created_at");
      setSpecials(all || []);
    } catch (e) {
      console.error("Error loading specials:", e);
    }
    setIsLoading(false);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, location: defaultLocation });
    setShowForm(true);
  };

  const openEdit = (special) => {
    setEditingId(special.id);
    setForm({
      title: special.title || "",
      description: special.description || "",
      includes: special.includes || "",
      location: special.location || "vadnais_heights",
      price: special.price ?? "",
      duration_hours: special.duration_hours ?? 1,
      days_of_week: special.days_of_week || [],
      window_start: special.window_start || "09:00",
      window_end: special.window_end || "22:00",
      valid_from: special.valid_from || "",
      valid_to: special.valid_to || "",
      is_active: special.is_active !== false
    });
    setShowForm(true);
  };

  const toggleDay = (day) => {
    setForm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort()
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert("Please enter a title for the special.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        includes: form.includes.trim() || null,
        location: form.location,
        price: Number(form.price) || 0,
        duration_hours: Number(form.duration_hours) || 1,
        days_of_week: form.days_of_week.length > 0 ? form.days_of_week : null,
        window_start: form.window_start,
        window_end: form.window_end,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        is_active: form.is_active
      };

      if (editingId) {
        await Special.update(editingId, payload);
      } else {
        await Special.create(payload);
      }
      setShowForm(false);
      setEditingId(null);
      await loadSpecials();
    } catch (err) {
      console.error("Error saving special:", err);
      alert("Error saving special. Please try again.");
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this special? This cannot be undone.")) return;
    try {
      await Special.delete(id);
      await loadSpecials();
    } catch (e) {
      console.error("Error deleting special:", e);
      alert("Error deleting special.");
    }
  };

  const handleToggleActive = async (special) => {
    try {
      await Special.update(special.id, { is_active: !special.is_active });
      await loadSpecials();
    } catch (e) {
      console.error("Error toggling special:", e);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Tag className="w-6 h-6 text-amber-500" />
          Specials
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {!showForm && (
        <Button onClick={openNew} className="mb-6 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-5 h-5 mr-2" />
          Add Special
        </Button>
      )}

      {/* Create / edit form */}
      {showForm && (
        <form onSubmit={handleSave} className="space-y-5 mb-8 p-5 bg-amber-50/50 rounded-xl border-2 border-amber-200">
          <h3 className="text-lg font-bold text-slate-800">
            {editingId ? "Edit Special" : "New Special"}
          </h3>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Sunday Family Hour"
              className="h-12"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description shown to customers"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>What's Included</Label>
            <Textarea
              value={form.includes}
              onChange={(e) => setForm({ ...form, includes: e.target.value })}
              placeholder="e.g. 1 hour bay rental, club rental, 1 free appetizer"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vadnais_heights">Vadnais Heights</SelectItem>
                  <SelectItem value="burnsville">Burnsville</SelectItem>
                  <SelectItem value="both">Both Locations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                className="h-12"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select
                value={String(form.duration_hours)}
                onValueChange={(v) => setForm({ ...form, duration_hours: Number(v) })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} hr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Earliest Start</Label>
              <Select value={form.window_start} onValueChange={(v) => setForm({ ...form, window_start: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Latest Start</Label>
              <Select value={form.window_end} onValueChange={(v) => setForm({ ...form, window_end: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Valid Days (leave all unselected for any day)</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    form.days_of_week.includes(day.value)
                      ? "bg-amber-500 text-white"
                      : "bg-white text-slate-600 border-2 border-slate-200 hover:border-amber-300"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Promo Starts (optional)</Label>
              <Input
                type="date"
                value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Promo Ends (optional)</Label>
              <Input
                type="date"
                value={form.valid_to}
                onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                className="h-12"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="special-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-5 h-5 accent-amber-500"
            />
            <Label htmlFor="special-active" className="cursor-pointer">
              Active (visible to customers)
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 h-12 bg-amber-500 hover:bg-amber-600"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                "Save Changes"
              ) : (
                "Create Special"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Existing specials list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : specials.length === 0 ? (
        <p className="text-center text-slate-500 py-8">No specials yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {specials.map((special) => (
            <Card key={special.id} className={`border-2 ${special.is_active ? "border-amber-200" : "border-slate-200 opacity-70"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800">{special.title}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {locationLabel(special.location)}
                      </span>
                      {!special.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    {special.description && (
                      <p className="text-sm text-slate-600 mt-1">{special.description}</p>
                    )}
                    {special.includes && (
                      <p className="text-sm text-slate-700 mt-1">
                        <span className="font-semibold">Includes:</span> {special.includes}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="font-bold text-amber-600 text-base">${Number(special.price).toFixed(2)}</span>
                      <span>{special.duration_hours} hr</span>
                      <span>
                        {formatTimeLabel(special.window_start || "09:00")}–{formatTimeLabel(special.window_end || "22:00")}
                      </span>
                      {special.days_of_week && special.days_of_week.length > 0 && (
                        <span>
                          {special.days_of_week.map((d) => DAYS[d].label).join(", ")}
                        </span>
                      )}
                      {(special.valid_from || special.valid_to) && (
                        <span>
                          {special.valid_from || "…"} → {special.valid_to || "…"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(special)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(special)}
                      className="text-xs"
                    >
                      {special.is_active ? "Hide" : "Show"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(special.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
