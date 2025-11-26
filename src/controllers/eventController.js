// src/controllers/eventController.js
const EventService = require("../services/eventService");
const { error } = require("../utils/response");

// GET /api/events/bar/:barPageId
async function getByBar(req, res) {
  try {
    const { barPageId } = req.params;
    const result = await EventService.listByBar(barPageId, req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getByBar error:", e);
    res.status(500).json(error("Lỗi máy chủ khi lấy danh sách sự kiện"));
  }
}

// PATCH /api/events/toggle/:id
async function toggleStatus(req, res) {
  try {
    const result = await EventService.toggleStatus(req.params.id);
    res.status(result.statusCode || (result.ok ? 200 : 400)).json(result);
  } catch (e) {
    console.error("toggleStatus error:", e);
    res.status(500).json(error("Lỗi máy chủ khi cập nhật trạng thái"));
  }
}

// GET /api/events/detail/:id  (hoặc /:id tùy bạn cấu hình trong routes)
async function getById(req, res) {
  try {
    const result = await EventService.getById(req.params.id);
    res.status(result.statusCode || (result.ok ? 200 : 200)).json(result);
  } catch (e) {
    console.error("getById error:", e);
    res.status(500).json(error("Lỗi máy chủ khi lấy sự kiện"));
  }
}

// POST /api/events
async function create(req, res) {
  try {
    const payload = { ...req.body };

    if (req.file?.secure_url) {
      payload.Picture = req.file.secure_url;
    }

    if (payload.StartTime) payload.StartTime = new Date(payload.StartTime);
    if (payload.EndTime) payload.EndTime = new Date(payload.EndTime);

    const result = await EventService.create(payload);
    res.status(result.statusCode || 201).json(result);
  } catch (e) {
    console.error("create event error:", e);
    res.status(500).json(error("Lỗi máy chủ khi tạo sự kiện"));
  }
}

// PUT /api/events/:id
async function update(req, res) {
  try {
    const body = { ...req.body };

    if (req.file?.secure_url) {
      body.Picture = req.file.secure_url;
    }

    if (body.StartTime) body.StartTime = new Date(body.StartTime);
    if (body.EndTime) body.EndTime = new Date(body.EndTime);

    const result = await EventService.update(req.params.id, body);
    res.status(result.statusCode || (result.ok ? 200 : 404)).json(result);
  } catch (e) {
    console.error("update event error:", e);
    res.status(500).json(error("Lỗi máy chủ khi cập nhật sự kiện"));
  }
}

// DELETE /api/events/:id
async function remove(req, res) {
  try {
    const result = await EventService.remove(req.params.id);
    res.status(result.statusCode || (result.ok ? 200 : 404)).json(result);
  } catch (e) {
    console.error("delete event error:", e);
    res.status(500).json(error("Lỗi máy chủ khi xoá sự kiện"));
  }
}
// GET /api/events
async function getAll(req, res) {
  try {
    const result = await EventService.getAll(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getAll events error:", e);
    res.status(500).json(error("Lỗi máy chủ"));
  }
}

// GET /api/events/search?q=summer
async function search(req, res) {
  try {
    const result = await EventService.search(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("search events error:", e);
    res.status(500).json(error("Lỗi máy chủ khi tìm kiếm"));
  }
}

module.exports = {
  getByBar,
  toggleStatus,
  getById,
  create,
  update,
  remove,
  getAll,     // mới
  search,
};
