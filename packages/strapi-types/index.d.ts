export type ID = string | number;

export type Result<T = any, U = any, V = any> = any;
export type PaginatedResult<T = any> = { data: T[]; meta: any };
export type FindMany<T = any, U = any> = any;
export type FindOne<T = any, U = any> = any;
export type FindFirst<T = any, U = any> = any;
export type Create<T = any, U = any> = any;
export type Delete<T = any, U = any> = any;
export type Update<T = any, U = any> = any;
export type Count<T = any, U = any> = any;
export type Publish<T = any, U = any> = any;
export type Unpublish<T = any, U = any> = any;
export type DiscardDraft<T = any, U = any> = any;
export type Utils = any;

export namespace UID {
  export type ContentType = any;
  export type Schema = any;
  export type CollectionType = any;
  export type SingleType = any;
  export type Component = any;
}
export type UID = any;

export namespace Data {
  export type Entity<T = any> = any;
  export type Collection<T = any> = any;
  export type Component<T = any> = any;
}
export type Data = any;

export type StrapiResponse<T = any> = {
  data: {
    id: number;
    attributes: T;
  } | null;
  meta?: any;
};

export type StrapiSingleResponse<T = any> = StrapiResponse<T>;

export type StrapiListResponse<T = any> = {
  data: Array<{
    id: number;
    attributes: T;
  }>;
  meta?: any;
};

