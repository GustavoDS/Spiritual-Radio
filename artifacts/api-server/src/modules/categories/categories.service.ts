import { Category } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export class CategoriesService {
  async findAll() {
    return Category.findAll({ order: [["nome", "ASC"]] });
  }

  async findById(id: number) {
    const cat = await Category.findByPk(id);
    if (!cat) throw new HttpError("Categoria não encontrada", 404);
    return cat;
  }

  async create(nome: string) {
    const existing = await Category.findOne({ where: { nome } });
    if (existing) throw new HttpError("Categoria já existe", 409);
    return Category.create({ nome });
  }

  async update(id: number, nome: string) {
    const cat = await Category.findByPk(id);
    if (!cat) throw new HttpError("Categoria não encontrada", 404);
    await cat.update({ nome });
    return cat;
  }

  async remove(id: number) {
    const cat = await Category.findByPk(id);
    if (!cat) throw new HttpError("Categoria não encontrada", 404);
    await cat.destroy();
    return { id };
  }
}

export const categoriesService = new CategoriesService();
