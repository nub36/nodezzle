/**
 * Минимальный маршрутизатор API.
 *
 * Без внешних зависимостей: сравнение сегментов пути, поддержка
 * параметров вида `/api/projects/:id`, проверка метода.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RouteContext {
  /** Параметры пути: для `/api/projects/:id` → `{ id: '...' }`. */
  params: Record<string, string>;
  req: IncomingMessage;
  res: ServerResponse;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

/** Сегмент-параметр в шаблоне пути. */
const isParam = (seg: string): boolean => seg.startsWith(':');

export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: RouteHandler): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: path.split('/').filter((s) => s !== ''),
      handler,
    });
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    return this.on('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.on('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): this {
    return this.on('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.on('DELETE', path, handler);
  }

  /**
   * Ищет маршрут под запрос.
   * Возвращает `null`, если путь не совпал ни с одним шаблоном,
   * и отдельный признак `methodNotAllowed`, если путь известен,
   * но метод не разрешён.
   */
  match(
    method: string,
    pathname: string,
  ): { handler: RouteHandler; params: Record<string, string> } | null | 'method_not_allowed' {
    const reqSegments = pathname.split('/').filter((s) => s !== '');
    let pathMatched = false;
    for (const route of this.routes) {
      if (route.segments.length !== reqSegments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const tpl = route.segments[i];
        const actual = reqSegments[i];
        if (isParam(tpl)) {
          params[tpl.slice(1)] = decodeURIComponent(actual);
        } else if (tpl !== actual) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method.toUpperCase()) return { handler: route.handler, params };
    }
    return pathMatched ? 'method_not_allowed' : null;
  }
}
